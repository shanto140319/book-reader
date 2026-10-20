// Turning a text selection on the PDF into a highlight, and finding the highlight under a tap.
//
// A highlight is saved as boxes measured in fractions (0–1) of the full, untrimmed page,
// so it lands on the same words at any zoom, margin trim or screen size.

import type { Highlight, HighlightColor, HighlightRect } from "@/lib/library/types";

/** Fill colours. Drawn with mix-blend-mode: multiply, so black text on the white page stays black. */
export const HIGHLIGHT_FILL: Record<HighlightColor, string> = {
  yellow: "rgb(255 226 92)",
  green: "rgb(160 232 146)",
  blue: "rgb(150 205 255)",
  pink: "rgb(255 168 205)",
  purple: "rgb(205 178 255)",
};

export const HIGHLIGHT_LABEL: Record<HighlightColor, string> = {
  yellow: "Yellow",
  green: "Green",
  blue: "Blue",
  pink: "Pink",
  purple: "Purple",
};

/** What a selection becomes once a colour is picked. */
export type HighlightDraft = Pick<Highlight, "page" | "rects" | "text" | "cfi">;

const MAX_RECTS = 200; // same limit as the database
const MAX_TEXT = 5000;

/**
 * Boxes and text for a selection on the PDF text layer, or null if it has no PDF text in it.
 * Works text node by text node: Range.getClientRects() on the whole range also returns the
 * full boxes of any element the selection starts or ends in, which would paint whole pages.
 */
export function draftFromRange(range: Range): HighlightDraft | null {
  const byPage = new Map<number, { inner: DOMRect; rects: DOMRect[] }>();
  let text = "";
  let lastBottom = -Infinity;

  for (const node of textNodesIn(range)) {
    const layer = node.parentElement?.closest(".textLayer");
    const inner = layer?.closest<HTMLElement>("[data-page-inner]");
    const page = Number(inner?.closest<HTMLElement>("[data-page]")?.dataset.page);
    if (!inner || !page) continue;

    const start = node === range.startContainer ? range.startOffset : 0;
    const end = node === range.endContainer ? range.endOffset : node.length;
    if (end <= start) continue;
    const piece = document.createRange();
    piece.setStart(node, start);
    piece.setEnd(node, end);
    const rects = [...piece.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5);
    if (!rects.length) continue;

    let entry = byPage.get(page);
    if (!entry) byPage.set(page, (entry = { inner: inner.getBoundingClientRect(), rects: [] }));
    entry.rects.push(...rects);

    // Text: the PDF's lines are separate spans, so add a space where a new line starts.
    const chunk = node.data.slice(start, end);
    if (text && rects[0].top >= lastBottom - rects[0].height / 2 && !/\s$/.test(text)) text += " ";
    text += chunk;
    lastBottom = rects.at(-1)!.bottom;
  }

  const rects: HighlightRect[] = [];
  for (const [page, { inner, rects: raw }] of [...byPage].sort((a, b) => a[0] - b[0])) {
    for (const r of mergeLines(raw)) {
      const x = clamp01((r.left - inner.left) / inner.width);
      const y = clamp01((r.top - inner.top) / inner.height);
      const w = Math.min(1 - x, r.width / inner.width);
      const h = Math.min(1 - y, r.height / inner.height);
      if (w > 0 && h > 0) rects.push({ page, x: round(x), y: round(y), w: round(w), h: round(h) });
    }
  }
  text = text.replace(/\s+/g, " ").trim();
  if (!rects.length || !text) return null;
  return { page: rects[0].page, rects: rects.slice(0, MAX_RECTS), text: text.slice(0, MAX_TEXT) };
}

function* textNodesIn(range: Range): Generator<Text> {
  const root = range.commonAncestorContainer;
  if (root instanceof Text) {
    yield root;
    return;
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (range.intersectsNode(n)) yield n as Text;
  }
}

/**
 * One box per run of words on a line, instead of one per PDF text span (often a box per word,
 * overlapping, which would show as darker stripes). Words further apart than about a letter
 * height stay separate, so two-column pages don't get the gap between columns painted.
 */
function mergeLines(rects: DOMRect[]) {
  const sorted = [...rects].sort((a, b) => a.top - b.top || a.left - b.left);
  const out: { left: number; top: number; right: number; bottom: number }[] = [];
  for (const r of sorted) {
    const prev = out.find((o) => {
      const overlap = Math.min(o.bottom, r.bottom) - Math.max(o.top, r.top);
      const height = Math.min(o.bottom - o.top, r.height);
      const gap = Math.max(r.left - o.right, o.left - r.right);
      return overlap > height * 0.5 && gap < Math.max(o.bottom - o.top, r.height);
    });
    if (prev) {
      prev.left = Math.min(prev.left, r.left);
      prev.right = Math.max(prev.right, r.right);
      prev.top = Math.min(prev.top, r.top);
      prev.bottom = Math.max(prev.bottom, r.bottom);
    } else {
      out.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
    }
  }
  return out.map((o) => ({ left: o.left, top: o.top, width: o.right - o.left, height: o.bottom - o.top }));
}

/** The highlight under a point given in page fractions, newest first (it's drawn on top). */
export function highlightAt(highlights: Highlight[], page: number, x: number, y: number) {
  const pad = 0.004; // a little slack, fingers aren't precise
  let hit: Highlight | null = null;
  for (const h of highlights) {
    const inside = h.rects.some(
      (r) => r.page === page && x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad,
    );
    if (inside && (!hit || h.createdAt > hit.createdAt)) hit = h;
  }
  return hit;
}

/** Reading order: by page, then top to bottom, then left to right. EPUB: by chapter, then place in the text. */
export function compareHighlights(a: Highlight, b: Highlight) {
  if (a.page !== b.page) return a.page - b.page;
  if (a.cfi || b.cfi) return compareSteps(cfiSteps(a.cfi), cfiSteps(b.cfi));
  const ra = a.rects[0];
  const rb = b.rects[0];
  return ra.y - rb.y || ra.x - rb.x;
}

/**
 * The numbers along a CFI range's start point, e.g. "epubcfi(/6/4!/4/2,/1:5,/1:9)" → [6, 4, 4, 2, 1, 5].
 * Enough to order two places in the same book (as text, "/10" would sort before "/4").
 */
function cfiSteps(cfi = "") {
  const inner = cfi.replace(/^epubcfi\(|\)$/g, "").replace(/\[[^\]]*\]/g, ""); // drop id assertions like [chap01]
  const [base, start = ""] = inner.split(",");
  return (base + start).match(/\d+/g)?.map(Number) ?? [];
}

function compareSteps(a: number[], b: number[]) {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const round = (n: number) => Math.round(n * 10000) / 10000;
