"use client";

import {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type Ref,
} from "react";
import { Document, Page, pdfjs } from "react-pdf";
import type { PDFDocumentProxy } from "pdfjs-dist";
import "react-pdf/dist/Page/TextLayer.css";
import type { Highlight, HighlightColor, HighlightRect } from "@/lib/library/types";
import { draftFromRange, HIGHLIGHT_FILL, highlightAt, type HighlightDraft } from "@/lib/reader/highlights";
import type { PdfFit } from "@/lib/reader/prefs";
import { speak, speechSupported, stopSpeaking } from "@/lib/reader/speech";
import { PDF_OPTIONS } from "@/lib/reader/pdfjs";
import { BookLoader } from "../BookLoader";
import { HighlightMenu, type MenuAnchor } from "./HighlightMenu";
import { SpeakCard } from "./SpeakCard";
import { TranslateCard } from "./TranslateCard";

// PDF.js parses and draws pages in a Web Worker so scrolling stays smooth.
// react-pdf requires this to be set in the same file that renders <Document>.
pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

/** Pages rendered on each side of the current page. Everything else is an empty placeholder. */
const RENDER_WINDOW = 2;
/** Pages on each side that also get the (DOM-heavy) selectable text layer. */
const TEXT_WINDOW = 1;
/** Page width at 100% / "Auto" on large screens (smaller screens use their full width). */
const AUTO_MAX_WIDTH = 920;
/** Longest canvas side in device pixels. Keeps memory sane at high zoom on big scanned books. */
const MAX_CANVAS_PX = 4096;

export type PdfScrollHandle = {
  scrollToPage: (page: number, smooth?: boolean) => void;
  /** Brings a highlight to the upper third of the screen. */
  scrollToHighlight: (highlight: Highlight, smooth?: boolean) => void;
};

/** One highlight box on one page, ready to draw. */
type PageMark = { id: string; color: HighlightColor; x: number; y: number; w: number; h: number };
const NO_MARKS: PageMark[] = [];

/** Text selected (pick a colour to highlight it) or a highlight tapped (change colour, remove). */
type Menu =
  | { kind: "new"; draft: HighlightDraft; anchor: MenuAnchor }
  | { kind: "edit"; id: string; anchor: MenuAnchor }
  // Bangla translation card. It stays open when the selection clears (phones clear it on
  // tapping the card), and closes with ×, Esc, a tap elsewhere or a new selection.
  | { kind: "translate"; text: string; anchor: MenuAnchor }
  // Read-aloud player; same closing rules. The voice stops whenever this menu goes away.
  | { kind: "speak"; text: string; anchor: MenuAnchor };

type Props = {
  ref?: Ref<PdfScrollHandle>;
  file: Blob;
  title: string;
  initialPage: number;
  fit: PdfFit;
  zoom: number;
  /** Fraction of the page width hidden on each side (0–0.25), to cut the PDF's own white margins. */
  trim: number;
  /** Called once the PDF is parsed; the sidebar reuses the same document for the outline and thumbnails. */
  onLoad: (pdf: PDFDocumentProxy) => void;
  onPageChange: (page: number, numPages: number) => void;
  /** Reports the effective zoom (1 = 100%), whatever the fit mode. */
  onScaleChange: (scale: number) => void;
  highlights: Highlight[];
  onAddHighlight: (draft: HighlightDraft, color: HighlightColor) => void;
  onRecolorHighlight: (id: string, color: HighlightColor) => void;
  onRemoveHighlight: (id: string) => void;
};

export default function PdfScrollView({
  ref,
  file,
  title,
  initialPage,
  fit,
  zoom,
  trim,
  onLoad,
  onPageChange,
  onScaleChange,
  highlights,
  onAddHighlight,
  onRecolorHighlight,
  onRemoveHighlight,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageEls = useRef(new Map<number, HTMLDivElement>());
  const restored = useRef(false);
  const currentPageRef = useRef(initialPage);
  /** Where the reader is, relative to a page, so zooming/resizing keeps the same spot on screen. */
  const anchor = useRef<{ page: number; frac: number } | null>(null);
  const prevLayout = useRef("");

  const [numPages, setNumPages] = useState(0);
  // Page 1's shape and real size, used to size every placeholder before pages render.
  const [base, setBase] = useState<{ ratio: number } | null>(null);
  const [ratios, setRatios] = useState<Record<number, number>>({}); // pages shaped differently from page 1
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [currentPage, setCurrentPage] = useState(initialPage);

  // Tight spacing on phones so the page uses almost the whole screen.
  const compact = box.width < 640;
  const pad = compact ? 4 : 16;
  const gap = compact ? 6 : 12;

  // Margin trim: each page is drawn `renderWidth` wide, but shown in a narrower box
  // (`boxWidth`) that hides `offset` px on the left and the same on the right.
  const renderWidth = base
    ? computeRenderWidth(fit, zoom, trim, box.width - pad * 2, box.height - gap * 2, base.ratio)
    : 0;
  const boxWidth = Math.floor(renderWidth * (1 - 2 * trim));
  const offset = Math.round(renderWidth * trim);
  const layoutKey = `${renderWidth}x${boxWidth}`;
  const ready = numPages > 0 && base !== null && boxWidth > 0;
  // Sharp on high-DPI screens, but never a canvas larger than MAX_CANVAS_PX.
  const dpr = renderWidth ? Math.max(0.75, Math.min(window.devicePixelRatio || 1, MAX_CANVAS_PX / renderWidth)) : 1;

  // Track the available size (window resize, phone rotation, sidebar toggle).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) =>
      setBox({ width: entry.contentRect.width, height: entry.contentRect.height }),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  async function handleLoad(pdf: PDFDocumentProxy) {
    const first = await pdf.getPage(1);
    const { width, height } = first.getViewport({ scale: 1 });
    setBase({ ratio: height / width });
    setNumPages(pdf.numPages);
    setCurrentPage((p) => Math.min(Math.max(1, p), pdf.numPages));
    onLoad(pdf);
  }

  // Restore: jump to the saved page once the placeholders exist.
  // useLayoutEffect runs before the browser paints, so there's no visible jump from page 1.
  useLayoutEffect(() => {
    if (!ready || restored.current) return;
    const page = Math.min(initialPage, numPages);
    const target = pageEls.current.get(page);
    const scroller = scrollRef.current;
    if (target && scroller) {
      scroller.scrollTop = target.offsetTop - gap;
      anchor.current = { page, frac: -gap / target.offsetHeight };
    }
    prevLayout.current = layoutKey;
    restored.current = true;
  }, [ready, initialPage, numPages, gap, layoutKey]);

  // Zoom / resize / trim: page sizes change, so put the same spot of the same page back on
  // screen, and keep wide (zoomed-in) pages horizontally centred.
  useLayoutEffect(() => {
    if (!restored.current || !renderWidth || layoutKey === prevLayout.current) return;
    prevLayout.current = layoutKey;
    const scroller = scrollRef.current;
    const a = anchor.current;
    const el = a ? pageEls.current.get(a.page) : undefined;
    if (!scroller) return;
    if (a && el) scroller.scrollTop = el.offsetTop + a.frac * el.offsetHeight;
    scroller.scrollLeft = (scroller.scrollWidth - scroller.clientWidth) / 2;
  }, [layoutKey, renderWidth]);

  function handleScroll() {
    const scroller = scrollRef.current;
    const page = currentPageRef.current;
    const el = pageEls.current.get(page);
    if (restored.current && scroller && el) {
      anchor.current = { page, frac: (scroller.scrollTop - el.offsetTop) / el.offsetHeight };
    }
  }

  // The "current page" is whichever page crosses the vertical middle of the viewport.
  // rootMargin shrinks the observed area to a 0px line in the middle of the screen.
  useEffect(() => {
    if (!ready || !scrollRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setCurrentPage(Number((entry.target as HTMLElement).dataset.page));
        }
      },
      { root: scrollRef.current, rootMargin: "-50% 0px -50% 0px" },
    );
    pageEls.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [ready, numPages]);

  useEffect(() => {
    currentPageRef.current = currentPage;
    if (restored.current && numPages) onPageChange(currentPage, numPages);
  }, [currentPage, numPages, onPageChange]);

  useEffect(() => {
    const hundred = hundredPercentWidth(trim, box.width - pad * 2);
    if (renderWidth && hundred > 0) onScaleChange(renderWidth / hundred);
  }, [renderWidth, trim, box.width, pad, onScaleChange]);

  // Stable callbacks so memoized PageSlots don't re-render when the current page changes.
  const registerPage = useCallback((n: number, el: HTMLDivElement | null) => {
    if (el) pageEls.current.set(n, el);
    else pageEls.current.delete(n);
  }, []);
  const baseRatio = base?.ratio;
  const handleRatio = useCallback(
    (n: number, ratio: number) => {
      // Only store pages whose shape differs from page 1 (avoids needless re-renders).
      if (baseRatio === undefined || Math.abs(ratio - baseRatio) <= 0.01) return;
      setRatios((r) => (r[n] === ratio ? r : { ...r, [n]: ratio }));
    },
    [baseRatio],
  );

  // ─── Highlights ─────────────────────────────────────────────────────────────

  // Boxes per page, oldest first so newer highlights are drawn on top. Rebuilt only when
  // the highlights change, so PageSlots keep their memo while you scroll.
  const marksByPage = useMemo(() => {
    const map = new Map<number, PageMark[]>();
    for (const h of [...highlights].sort((a, b) => a.createdAt - b.createdAt)) {
      for (const r of h.rects) {
        const list = map.get(r.page) ?? [];
        list.push({ id: h.id, color: h.color, x: r.x, y: r.y, w: r.w, h: r.h });
        map.set(r.page, list);
      }
    }
    return map;
  }, [highlights]);

  const [menu, setMenu] = useState<Menu | null>(null);
  // Zoom, resize or trim moves the words, so a menu pointing at them closes.
  const [menuLayout, setMenuLayout] = useState(layoutKey);
  if (menuLayout !== layoutKey) {
    setMenuLayout(layoutKey);
    setMenu(null);
  }

  // Selecting text shows the colour menu once the selection settles: after the mouse/finger
  // is released, or (phones) after the selection handles stop moving for a moment.
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    let pressed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const closeNew = () => setMenu((m) => (m?.kind === "new" ? null : m));

    function check() {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (pressed || !scroller) return; // checked again on release
        const sel = document.getSelection();
        if (!sel || sel.isCollapsed || !sel.rangeCount) return closeNew();
        const range = sel.getRangeAt(0);
        if (!scroller.contains(range.commonAncestorContainer)) return closeNew();
        const draft = draftFromRange(range);
        if (!draft) return closeNew();
        // Leave an open translation/player of this same text alone (pressing its button
        // "re-settles" the selection).
        setMenu((m) =>
          (m?.kind === "translate" || m?.kind === "speak") && m.text === draft.text
            ? m
            : { kind: "new", draft, anchor: anchorFor(scroller, pageEls.current, draft.rects) },
        );
      }, 200);
    }
    const press = () => (pressed = true);
    const release = () => {
      if (!pressed) return;
      pressed = false;
      check();
    };
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setMenu(null);
      if (scroller?.contains(document.getSelection()?.anchorNode ?? null)) document.getSelection()?.removeAllRanges();
    }

    document.addEventListener("selectionchange", check);
    scroller.addEventListener("pointerdown", press);
    document.addEventListener("pointerup", release);
    document.addEventListener("pointercancel", release);
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("selectionchange", check);
      scroller.removeEventListener("pointerdown", press);
      document.removeEventListener("pointerup", release);
      document.removeEventListener("pointercancel", release);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  // Tapping a highlight opens its menu; tapping anywhere else closes it. The boxes themselves
  // don't take clicks (pointer-events: none) so the text under them can still be selected.
  function handleClick(e: MouseEvent) {
    const sel = document.getSelection();
    if (sel && !sel.isCollapsed) return;
    const inner = (e.target as Element).closest<HTMLElement>("[data-page-inner]");
    const page = Number(inner?.closest<HTMLElement>("[data-page]")?.dataset.page);
    const scroller = scrollRef.current;
    if (!inner || !page || !scroller) return setMenu(null);
    const r = inner.getBoundingClientRect();
    const hit = highlightAt(highlights, page, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    setMenu(hit ? { kind: "edit", id: hit.id, anchor: anchorFor(scroller, pageEls.current, hit.rects) } : null);
  }

  function finish() {
    setMenu(null);
    document.getSelection()?.removeAllRanges();
  }

  function copy(text: string) {
    navigator.clipboard?.writeText(text).catch(() => {});
    finish();
  }

  const editing = menu?.kind === "edit" ? highlights.find((h) => h.id === menu.id) : undefined;

  // Read aloud. speak() runs right in the tap (iPhone allows speech only from a tap), then the
  // player opens. Leaving the player (any other menu, or none) stops the voice, as does leaving the book.
  const canSpeak = speechSupported();
  function startSpeaking(text: string, anchor: MenuAnchor) {
    speak(text);
    setMenu({ kind: "speak", text, anchor });
  }
  const speaking = menu?.kind === "speak";
  useEffect(() => {
    if (!speaking) stopSpeaking();
  }, [speaking]);
  useEffect(() => stopSpeaking, []);

  useImperativeHandle(
    ref,
    () => ({
      scrollToPage(page, smooth = false) {
        const el = pageEls.current.get(page);
        scrollRef.current?.scrollTo({ top: el ? el.offsetTop - gap : 0, behavior: smooth ? "smooth" : "instant" });
      },
      scrollToHighlight(highlight, smooth = false) {
        const scroller = scrollRef.current;
        const el = pageEls.current.get(highlight.page);
        const first = highlight.rects[0];
        if (!scroller || !el || !first) return;
        const top = el.offsetTop + first.y * el.offsetHeight - scroller.clientHeight / 3;
        scroller.scrollTo({ top: Math.max(0, top), behavior: smooth ? "smooth" : "instant" });
      },
    }),
    [gap],
  );

  return (
    // `relative` makes this the offsetParent of the pages, so page.offsetTop is measured from
    // the top of the scroll area (not the whole window, which included the 56px header).
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      onClick={handleClick}
      className="relative h-full overflow-auto overscroll-contain"
    >
      {/*
        suspense={false}: react-pdf 11 suspends by default, which hands loading to the
        nearest <Suspense> (the whole reader). That hid the reader and reset the scroll
        to the top whenever a new page started loading. With it off, each page shows its
        own `loading` placeholder inside its fixed-size box.
      */}
      <Document
        file={file}
        options={PDF_OPTIONS}
        suspense={false}
        onLoadSuccess={handleLoad}
        loading={<BookLoader title={title} className="min-h-[calc(100dvh-3.5rem)]" />}
        error={<p className="p-10 text-center text-sm text-danger">This PDF couldn&apos;t be opened.</p>}
      >
        {ready && (
          // w-max + min-w-full: when zoomed wider than the screen, the column grows and
          // scrolls sideways instead of being cut off on the left.
          <div className="flex w-max min-w-full flex-col items-center" style={{ gap, padding: `${gap}px ${pad}px` }}>
            {Array.from({ length: numPages }, (_, i) => {
              const n = i + 1;
              const distance = Math.abs(n - currentPage);
              return (
                <PageSlot
                  key={n}
                  n={n}
                  boxWidth={boxWidth}
                  renderWidth={renderWidth}
                  height={renderWidth * (ratios[n] ?? base.ratio)}
                  offset={offset}
                  dpr={dpr}
                  mode={distance <= TEXT_WINDOW ? "text" : distance <= RENDER_WINDOW ? "canvas" : "empty"}
                  marks={marksByPage.get(n) ?? NO_MARKS}
                  register={registerPage}
                  onRatio={handleRatio}
                />
              );
            })}
          </div>
        )}
      </Document>
      {menu?.kind === "new" && (
        <HighlightMenu
          anchor={menu.anchor}
          scrollerRef={scrollRef}
          onColor={(color) => {
            onAddHighlight(menu.draft, color);
            finish();
          }}
          onCopy={() => copy(menu.draft.text)}
          onTranslate={() => setMenu({ kind: "translate", text: menu.draft.text, anchor: menu.anchor })}
          onSpeak={canSpeak ? () => startSpeaking(menu.draft.text, menu.anchor) : undefined}
        />
      )}
      {menu?.kind === "speak" && (
        <SpeakCard text={menu.text} anchor={menu.anchor} scrollerRef={scrollRef} onClose={finish} />
      )}
      {menu?.kind === "translate" && (
        <TranslateCard
          key={menu.text}
          text={menu.text}
          anchor={menu.anchor}
          scrollerRef={scrollRef}
          onClose={finish}
        />
      )}
      {editing && menu && (
        <HighlightMenu
          anchor={menu.anchor}
          scrollerRef={scrollRef}
          current={editing.color}
          onColor={(color) => {
            if (color !== editing.color) onRecolorHighlight(editing.id, color);
            finish();
          }}
          onCopy={() => copy(editing.text)}
          onTranslate={() => setMenu({ kind: "translate", text: editing.text, anchor: menu.anchor })}
          onSpeak={canSpeak ? () => startSpeaking(editing.text, menu.anchor) : undefined}
          onDelete={() => {
            onRemoveHighlight(editing.id);
            finish();
          }}
        />
      )}
    </div>
  );
}

/**
 * Width to draw the full page at. Fit modes apply to the visible (trimmed) part:
 * e.g. "Fit width" makes the trimmed page fill the screen, so the text gets bigger.
 */
function computeRenderWidth(
  fit: PdfFit,
  zoom: number,
  trim: number,
  availWidth: number,
  availHeight: number,
  ratio: number,
) {
  const keep = 1 - 2 * trim; // visible share of the page width
  const hundred = hundredPercentWidth(trim, availWidth);
  let width: number;
  if (fit === "width") width = availWidth / keep;
  else if (fit === "page") width = Math.min(availWidth / keep, availHeight / ratio);
  else if (fit === "custom") width = hundred * zoom;
  else width = hundred;
  return Math.max(0, Math.floor(width));
}

/**
 * What 100% means on this screen: the comfortable reading width ("Auto"). On a phone that's
 * the full screen width, on a laptop it's capped at AUTO_MAX_WIDTH. Zoom % is relative to it,
 * so 100% always fits whatever device you're on.
 */
function hundredPercentWidth(trim: number, availWidth: number) {
  return Math.min(availWidth, AUTO_MAX_WIDTH) / (1 - 2 * trim);
}

type SlotProps = {
  n: number;
  boxWidth: number;
  renderWidth: number;
  height: number;
  offset: number;
  dpr: number;
  /** text: canvas + selectable text · canvas: canvas only · empty: lightweight placeholder */
  mode: "text" | "canvas" | "empty";
  marks: PageMark[];
  register: (n: number, el: HTMLDivElement | null) => void;
  onRatio: (n: number, ratio: number) => void;
};

/**
 * One page box. memo() + primitive props mean that when you move to the next page, only the
 * few boxes whose mode changes re-render, not all of them (that mattered on 200+ page books).
 */
const PageSlot = memo(function PageSlot({
  n,
  boxWidth,
  renderWidth,
  height,
  offset,
  dpr,
  mode,
  marks,
  register,
  onRatio,
}: SlotProps) {
  const ref = useCallback((el: HTMLDivElement | null) => register(n, el), [register, n]);
  return (
    <div
      data-page={n}
      ref={ref}
      style={{ width: boxWidth, height }}
      className="pdf-page relative shrink-0 overflow-hidden rounded-[2px] bg-white shadow-[0_1px_3px_rgb(0_0_0/0.1),0_10px_28px_-14px_rgb(0_0_0/0.28)]"
    >
      {mode === "empty" ? (
        <span aria-hidden className="absolute inset-x-0 top-1/2 text-center text-xs tabular-nums text-neutral-300">
          {n}
        </span>
      ) : (
        // Full-size page shifted left by `offset`; the box's overflow-hidden clips both sides.
        // Highlights are measured against this full-size box (data-page-inner).
        <div data-page-inner className="absolute top-0" style={{ left: -offset, width: renderWidth, height }}>
          <Page
            suspense={false}
            pageNumber={n}
            width={renderWidth}
            devicePixelRatio={dpr}
            renderTextLayer={mode === "text"}
            renderAnnotationLayer={false}
            loading={<LoadingPage />}
            onLoadSuccess={(page) => onRatio(n, page.originalHeight / page.originalWidth)}
          />
          {marks.length > 0 && (
            // Above the text layer, but click-through. Multiply keeps the words dark under the colour.
            <div aria-hidden className="pointer-events-none absolute inset-0 mix-blend-multiply">
              {marks.map((m, i) => (
                <div
                  key={`${m.id}-${i}`}
                  className="absolute rounded-[2px]"
                  style={{
                    left: `${m.x * 100}%`,
                    top: `${m.y * 100}%`,
                    width: `${m.w * 100}%`,
                    height: `${m.h * 100}%`,
                    background: HIGHLIGHT_FILL[m.color],
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

const SKELETON_LINES = ["38%", "92%", "97%", "88%", "95%", "70%", "", "94%", "90%", "96%", "62%"];

/**
 * Faint "text lines" while a nearby page is drawing. One animation for the whole block
 * (not one per line), and only on the few pages actually loading. Earlier every one of
 * 200 placeholders animated ~10 lines, which made phones recalculate styles every frame.
 */
function LoadingPage() {
  return (
    <div aria-hidden className="absolute inset-0 animate-pulse bg-white px-[9%] py-[11%]">
      {SKELETON_LINES.map((w, i) =>
        w ? (
          <div key={i} className="mb-3 h-2 rounded-full bg-neutral-100" style={{ width: w }} />
        ) : (
          <div key={i} className="h-4" />
        ),
      )}
    </div>
  );
}

/**
 * Where a highlight's menu points: the area its boxes cover, in the scroll area's content
 * coordinates. Pages are looked up live, so it's right at any zoom or trim.
 */
function anchorFor(scroller: HTMLElement, pageEls: Map<number, HTMLDivElement>, rects: HighlightRect[]): MenuAnchor {
  const view = scroller.getBoundingClientRect();
  let top = Infinity;
  let bottom = -Infinity;
  let left = Infinity;
  let right = -Infinity;
  for (const r of rects) {
    const inner = pageEls.get(r.page)?.querySelector("[data-page-inner]");
    if (!inner) continue;
    const p = inner.getBoundingClientRect();
    top = Math.min(top, p.top + r.y * p.height);
    bottom = Math.max(bottom, p.top + (r.y + r.h) * p.height);
    left = Math.min(left, p.left + r.x * p.width);
    right = Math.max(right, p.left + (r.x + r.w) * p.width);
  }
  if (top === Infinity) return { top: scroller.scrollTop, bottom: scroller.scrollTop, x: scroller.clientWidth / 2 };
  const dy = scroller.scrollTop - view.top;
  return { top: top + dy, bottom: bottom + dy, x: (left + right) / 2 + scroller.scrollLeft - view.left };
}
