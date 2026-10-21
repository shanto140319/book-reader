"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from "react";
import { EpubCFI, type Book as EpubBook, type Contents, type Location, type Rendition } from "epubjs";
import type { Highlight, HighlightColor } from "@/lib/library/types";
import { EPUB_THEMES, epubCss, highlightStyles, type EpubLook } from "@/lib/reader/epub";
import type { HighlightDraft } from "@/lib/reader/highlights";
import { speak, speechSupported, stopSpeaking } from "@/lib/reader/speech";
import { HighlightMenu, type MenuAnchor } from "../shared/HighlightMenu";
import { SpeakCard } from "../shared/SpeakCard";
import { TranslateCard } from "../shared/TranslateCard";

export type EpubViewHandle = {
  /** Shows a CFI or a chapter link (from the contents). */
  display: (target: string) => void;
  next: () => void;
  prev: () => void;
};

/** Same kinds as the PDF view: new selection, tapped highlight, translation card, read-aloud player. */
type Menu =
  | { kind: "new"; draft: HighlightDraft; anchor: MenuAnchor }
  | { kind: "edit"; id: string; anchor: MenuAnchor }
  | { kind: "translate"; text: string; anchor: MenuAnchor }
  | { kind: "speak"; text: string; anchor: MenuAnchor };

type Props = {
  ref?: Ref<EpubViewHandle>;
  book: EpubBook;
  /** Where to open; only read when the view is created. */
  initialCfi: string | null;
  look: EpubLook;
  /** How much of the side margins to remove: 0 = all of them shown, 1 = nearly edge to edge. */
  trim: number;
  /** `cfi`: the first word on screen, which is where to reopen the book. */
  onRelocated: (location: Location, cfi: string) => void;
  highlights: Highlight[];
  onAddHighlight: (draft: HighlightDraft, color: HighlightColor) => void;
  onRecolorHighlight: (id: string, color: HighlightColor) => void;
  onRemoveHighlight: (id: string) => void;
};

const MAX_TEXT = 5000; // same limit as the database
const SETTLE_MS = 200;
// The buttons are 40px, 8–12px from the edge; the margins are 56–64px (sm/lg) before trimming.
const MAX_TRIM_WITH_BUTTONS = 0.1;
const BUTTONS_MS = 4000; // how long the big page-turn buttons stay after the last tap

/**
 * One EPUB, laid out in pages (two side by side on wide screens) by epub.js, inside iframes.
 * Turn pages with the arrow keys, by tapping the left/right edge, or by swiping (finger, mouse
 * drag or a two-finger trackpad swipe). Tapping the middle shows big page-turn buttons for a while.
 */
export default function EpubView(props: Props) {
  const { ref, book, initialCfi, look, trim, highlights } = props;
  const wrapRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const [rendition, setRendition] = useState<Rendition | null>(null);
  // The same, for handlers registered once with epub.js (state would be stale in them).
  const renditionRef = useRef<Rendition | null>(null);
  const startCfi = useRef<string | null>(null); // the first word on screen
  const lastTurn = useRef<1 | -1>(1); // which way the reader last went, for skipping empty pages
  const blankSkips = useRef(0);

  function turn(dir: 1 | -1) {
    const r = renditionRef.current;
    if (!r) return;
    lastTurn.current = dir;
    void (dir > 0 ? r.next() : r.prev());
  }
  const [menu, setMenu] = useState<Menu | null>(null);

  // Big page-turn buttons, shown by tapping the middle of the page; they hide after a while.
  const [buttons, setButtons] = useState(false);
  const [buttonsUsed, setButtonsUsed] = useState(0); // bumped on each use, restarting the wait
  useEffect(() => {
    if (!buttons) return;
    const timer = setTimeout(() => setButtons(false), BUTTONS_MS);
    return () => clearTimeout(timer);
  }, [buttons, buttonsUsed]);

  // Handlers registered once with epub.js read the latest values through refs.
  const latest = useRef({ props, menu, look });
  // Read by the resize observer, which runs before ordinary effects: so set in a layout effect.
  const trimRef = useRef(trim);
  useLayoutEffect(() => {
    trimRef.current = trim;
  }, [trim]);
  useEffect(() => {
    latest.current = { props, menu, look };
  });

  // ─── Rendition ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    // The reader's colours and fonts go into each chapter's HTML before epub.js lays it out.
    // (Adding them once it's shown, as epub.js's own themes do, reflows the chapter after the
    // page was picked, so a saved position opened a page or two off.)
    const addLook = (_output: string, section: { output: string }) => {
      section.output = withStyle(section.output, epubCss(latest.current.look));
    };
    book.spine.hooks.serialize.register(addLook);

    let r: Rendition | null = null;
    let shown: Promise<void> = Promise.resolve();
    let observer: ResizeObserver | null = null;
    // Created a moment later: React (dev) mounts, unmounts and mounts again right away, and a
    // rendition destroyed before it has started throws inside epub.js.
    const timer = setTimeout(() => {
      const rendition = (r = book.renderTo(viewer, {
        width: "100%",
        height: "100%",
        flow: "paginated",
        // Two pages side by side from 720px, so lines don't run too long to read comfortably.
        spread: "auto",
        minSpreadWidth: 720,
        // Safari (so every iPhone browser) runs none of our taps, swipes or selection listeners
        // in a frame that can't run scripts. The book's own scripts are blocked by withStyle.
        allowScriptedContent: true,
        // epub.js reads this, but its types leave it out.
        ...({ gap: gapFor(viewer.clientWidth, trimRef.current) } as object),
      }));

      rendition.hooks.content.register((contents: Contents) => watchSelection(contents));
      rendition.on("relocated", (location: Location) => {
        setMenu(null); // the words a menu points at have moved off screen
        const shownPage = readPage(rendition, viewer);
        // epub.js sometimes adds an empty page (or spread) at the end of a chapter: go on past it.
        if (shownPage.blank && blankSkips.current < 2) {
          blankSkips.current++;
          void (lastTurn.current < 0 ? rendition.prev() : rendition.next());
          return;
        }
        blankSkips.current = 0;
        const cfi = shownPage.cfi ?? location.start.cfi;
        startCfi.current = cfi;
        latest.current.props.onRelocated(location, cfi);
      });
      rendition.on("click", (e: MouseEvent, contents: Contents) => handleTap(e, contents));
      rendition.on("keydown", (e: KeyboardEvent) => handleKey(e));
      rendition.on("mousedown", (e: MouseEvent) => swipeStart(e.button === 0 ? e : undefined, e.target));
      rendition.on("mouseup", (e: MouseEvent) => swipeEnd(e, e.target));

      // A saved position that no longer resolves (e.g. damaged) falls back to the start.
      // epub.js queues its work: once this first page is shown, it has started and attached.
      shown = (initialCfi ? showCfi(rendition, initialCfi) : rendition.display())
        .catch(() => rendition.display())
        .catch(() => {});
      renditionRef.current = rendition;
      setRendition(rendition);

      // The panel opening/closing changes our size without a window resize.
      void shown.then(() => {
        if (r !== rendition) return; // already gone
        // Trimming the margins changes our width too, so the gap between pages is set here.
        observer = new ResizeObserver(() => {
          const { clientWidth, clientHeight } = viewer;
          if (!clientWidth || !clientHeight) return;
          const manager = (rendition as unknown as { manager?: { settings: { gap?: number } } }).manager;
          if (manager) manager.settings.gap = gapFor(clientWidth, trimRef.current);
          rendition.resize(clientWidth, clientHeight);
        });
        observer.observe(viewer);
      });
    }, 0);

    return () => {
      clearTimeout(timer);
      book.spine?.hooks.serialize.deregister(addLook); // spine is gone if the book was destroyed first
      observer?.disconnect();
      const rendition = r;
      r = null;
      // Still starting: destroying it now would throw when its queued start runs.
      if (rendition) void shown.then(() => rendition.destroy());
      renditionRef.current = null;
      setRendition(null);
    };
    // initialCfi is only the starting point; later positions come from the reader.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book]);

  // ─── Look (theme, font, size, spacing) ──────────────────────────────────────

  // Bigger text means more pages: after a change, go back to the words that were on screen.
  // Taken at the first change of a burst (quick +/+/+ clicks) and kept until we're back there,
  // since each reflow moves epub.js's own idea of where we are.
  const keepCfi = useRef<string | null>(null);
  const lookKey = [...Object.values(look), trim].join("|");
  const shownLook = useRef(lookKey);
  useEffect(() => {
    if (!rendition || shownLook.current === lookKey) return;
    shownLook.current = lookKey;
    keepCfi.current ??= startCfi.current;
    for (const contents of allContents(rendition)) {
      const style = contents.document.getElementById("pata-look");
      if (style) style.textContent = epubCss(latest.current.look);
    }
    const timer = setTimeout(() => {
      const cfi = keepCfi.current;
      if (!cfi) return;
      void showCfi(rendition, cfi).finally(() => {
        if (keepCfi.current === cfi) keepCfi.current = null;
      });
    }, 120);
    return () => clearTimeout(timer);
  }, [rendition, lookKey]);

  // ─── Highlights on the page ─────────────────────────────────────────────────

  // What's drawn now, by highlight id, so only changes are redrawn.
  const drawn = useRef(new Map<string, { cfi: string; key: string }>());
  useEffect(() => {
    if (!rendition) return;
    const marks = drawn.current;
    const wanted = new Map(highlights.filter((h) => h.cfi).map((h) => [h.id, h]));
    for (const [id, mark] of marks) {
      const h = wanted.get(id);
      if (h && `${h.color}|${look.theme}` === mark.key) continue;
      rendition.annotations.remove(mark.cfi, "highlight");
      marks.delete(id);
    }
    for (const [id, h] of wanted) {
      if (marks.has(id)) continue;
      rendition.annotations.highlight(h.cfi!, { id }, undefined, "pata-hl", highlightStyles(h.color, look.theme));
      marks.set(id, { cfi: h.cfi!, key: `${h.color}|${look.theme}` });
    }
  }, [rendition, highlights, look.theme]);
  useEffect(() => {
    const marks = drawn.current;
    return () => marks.clear(); // the rendition (and its marks) went away
  }, [rendition]);

  // ─── Selection → colour menu ────────────────────────────────────────────────
  // Same rules as the PDF: the menu shows once the selection settles (mouse/finger released,
  // or the phone's selection handles stop moving for a moment).

  function watchSelection(contents: Contents) {
    const doc = contents.document;
    doc.addEventListener("wheel", handleWheel, { passive: false }); // epub.js doesn't pass wheel events on
    // Touches are listened to here, not through epub.js, which doesn't pass touchcancel on.
    const opts = { passive: true };
    doc.addEventListener("touchstart", (e) => swipeStart(e.touches.length === 1 ? e.touches[0] : undefined, e.target), opts);
    doc.addEventListener("touchmove", (e) => swipeMove(e.touches[0]), opts);
    doc.addEventListener("touchend", (e) => swipeEnd(e.changedTouches[0], e.target), opts);
    doc.addEventListener("touchcancel", (e) => swipeEnd(undefined, e.target), opts);
    let pressed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const closeNew = () => setMenu((m) => (m?.kind === "new" ? null : m));

    function check() {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (pressed) return; // checked again on release
        const sel = contents.window.getSelection();
        if (!sel || sel.isCollapsed || !sel.rangeCount) return closeNew();
        const range = sel.getRangeAt(0);
        const text = range.toString().replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
        if (!text) return closeNew();
        let cfi: string;
        try {
          cfi = contents.cfiFromRange(range);
        } catch {
          return closeNew();
        }
        const draft: HighlightDraft = { page: contents.sectionIndex + 1, rects: [], cfi, text };
        const anchor = anchorFor(range.getClientRects(), contents);
        if (!anchor) return closeNew();
        // Leave an open translation/player of this same text alone.
        setMenu((m) => ((m?.kind === "translate" || m?.kind === "speak") && m.text === text ? m : { kind: "new", draft, anchor }));
      }, SETTLE_MS);
    }
    const press = () => (pressed = true);
    const release = () => {
      if (!pressed) return;
      pressed = false;
      check();
    };
    doc.addEventListener("selectionchange", check);
    doc.addEventListener("pointerdown", press);
    doc.addEventListener("pointerup", release);
    doc.addEventListener("pointercancel", release);
  }

  /**
   * Where a menu points at, in our own coordinates: the area the boxes cover. Boxes are measured
   * inside a chapter's iframe, so they're moved by where that iframe sits on screen.
   */
  function anchorFor(rects: DOMRectList | DOMRect[], contents: Contents): MenuAnchor | null {
    const frame = contents.window.frameElement;
    const wrap = wrapRef.current;
    if (!frame || !wrap) return null;
    const f = frame.getBoundingClientRect();
    const w = wrap.getBoundingClientRect();
    let top = Infinity;
    let bottom = -Infinity;
    let left = Infinity;
    let right = -Infinity;
    for (const r of rects) {
      if (r.width < 0.5 || r.height < 0.5) continue;
      // In a two-page spread a selection can run into the hidden next page; keep what's visible.
      const x = f.left + r.left;
      if (x + r.width < w.left || x > w.right) continue;
      top = Math.min(top, f.top + r.top);
      bottom = Math.max(bottom, f.top + r.bottom);
      left = Math.min(left, x);
      right = Math.max(right, x + r.width);
    }
    if (top === Infinity) return null;
    return { top: top - w.top, bottom: bottom - w.top, x: (left + right) / 2 - w.left };
  }

  // ─── Taps, keys, swipes ─────────────────────────────────────────────────────

  function handleTap(e: MouseEvent, contents: Contents) {
    if (justSwiped()) return;
    if (e.defaultPrevented || (e.target as Element | null)?.closest?.("a")) return; // links: epub.js follows them
    const sel = contents.window.getSelection();
    if (sel && !sel.isCollapsed) return; // the end of a selection, not a tap

    const { props: p, menu: open } = latest.current;
    // Tapping a highlight opens its menu.
    const hit = highlightAt(p.highlights, contents, e.clientX, e.clientY);
    if (hit) {
      const anchor = anchorFor(contents.range(hit.cfi!).getClientRects(), contents);
      if (anchor) return setMenu({ kind: "edit", id: hit.id, anchor });
    }
    // With a menu open, a tap only closes it.
    if (open) return finish();

    const frame = contents.window.frameElement;
    if (frame) tapZone(frame.getBoundingClientRect().left + e.clientX);
  }

  /**
   * The left or right quarter of the reading area turns the page; the middle shows or hides the
   * big page-turn buttons. `x` is in window coordinates.
   */
  function tapZone(x: number) {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const w = wrap.getBoundingClientRect();
    const at = (x - w.left) / w.width;
    if (at < 0.25) turn(-1);
    else if (at > 0.75) turn(1);
    else {
      setButtons((on) => !on);
      setButtonsUsed((n) => n + 1);
    }
  }

  /** Taps on the margins around the book (outside its iframes): same as tapping the page's edge. */
  function handleMarginClick(e: React.MouseEvent) {
    if (onControl(e.target) || justSwiped()) return;
    if (latest.current.menu) return finish();
    tapZone(e.clientX);
  }

  function handleKey(e: KeyboardEvent) {
    const target = e.target as HTMLElement | null;
    if (target?.closest?.("input, textarea, select, [contenteditable=true]")) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "ArrowRight" || e.key === "PageDown" || (e.key === " " && !e.shiftKey)) turn(1);
    else if (e.key === "ArrowLeft" || e.key === "PageUp" || (e.key === " " && e.shiftKey)) turn(-1);
    else if (e.key === "Escape") return finish();
    else return;
    e.preventDefault();
  }

  // Keys pressed outside the book (after clicking the header, say) turn pages too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => handleKey(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // handleKey only reads refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A swipe is a quick, mostly sideways drag, by finger or mouse, in the book or its margins.
  // Points are in the coordinates of the document they happened in, so a swipe starts and ends
  // in the same one. A phone's browser may cancel a touch partway (to use the drag itself), so
  // then the last point the finger moved to counts as where it ended.
  type Point = { clientX: number; clientY: number };
  const swipe = useRef<{ x: number; y: number; t: number; doc: Document | null; last: Point } | null>(null);
  const swipedAt = useRef(0); // the click that ends a mouse swipe isn't also a tap
  function swipeStart(p: Point | undefined, target: EventTarget | null) {
    swipe.current = p
      ? { x: p.clientX, y: p.clientY, t: Date.now(), doc: docOf(target), last: { clientX: p.clientX, clientY: p.clientY } }
      : null;
  }
  function swipeMove(p: Point | undefined) {
    if (swipe.current && p) swipe.current.last = { clientX: p.clientX, clientY: p.clientY };
  }
  function swipeEnd(p: Point | undefined, target: EventTarget | null) {
    const start = swipe.current;
    swipe.current = null;
    if (!start || start.doc !== docOf(target)) return;
    const end = p ?? start.last;
    const dx = end.clientX - start.x;
    const dy = end.clientY - start.y;
    if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx) * 0.7 || Date.now() - start.t > 1000) return;
    const sel = start.doc?.getSelection();
    if (sel && !sel.isCollapsed) return; // selecting text, or dragging a selection handle
    swipedAt.current = Date.now();
    turn(dx < 0 ? 1 : -1);
  }
  const justSwiped = () => Date.now() - swipedAt.current < 400;

  // Two-finger sideways swipe on a trackpad (or a sideways wheel): one page per gesture.
  // A gesture keeps sending events (with momentum) for a while; a pause starts a new one.
  const wheel = useRef({ sum: 0, last: 0, done: false });
  function handleWheel(e: WheelEvent) {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    e.preventDefault(); // not the browser's swipe-to-go-back
    const w = wheel.current;
    const now = Date.now();
    if (now - w.last > 250) Object.assign(w, { sum: 0, done: false });
    w.last = now;
    if (w.done) return;
    w.sum += e.deltaX;
    if (Math.abs(w.sum) < 40) return;
    w.done = true;
    turn(w.sum > 0 ? 1 : -1);
  }

  // The margins (the book's iframes get theirs through epub.js and watchSelection).
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const onWheel = (e: WheelEvent) => {
      if (!onControl(e.target)) handleWheel(e);
    };
    wrap.addEventListener("wheel", onWheel, { passive: false }); // React's onWheel can't preventDefault
    return () => wrap.removeEventListener("wheel", onWheel);
    // handleWheel only reads refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Menu actions ───────────────────────────────────────────────────────────

  function finish() {
    setMenu(null);
    const r = renditionRef.current;
    if (r) for (const c of allContents(r)) c.window.getSelection()?.removeAllRanges();
  }

  function copy(text: string) {
    navigator.clipboard?.writeText(text).catch(() => {});
    finish();
  }

  // Read aloud: speak() runs right in the tap (iPhone allows speech only from a tap).
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

  const editing = menu?.kind === "edit" ? highlights.find((h) => h.id === menu.id) : undefined;

  useImperativeHandle(
    ref,
    () => ({
      display: (target) => {
        if (!rendition) return;
        lastTurn.current = 1;
        void (target.startsWith("epubcfi(") ? showCfi(rendition, target) : rendition.display(target));
      },
      next: () => turn(1),
      prev: () => turn(-1),
    }),
    [rendition],
  );

  const colors = EPUB_THEMES[look.theme];

  return (
    <div
      ref={wrapRef}
      onClick={handleMarginClick}
      onTouchStart={(e) => swipeStart(e.touches.length === 1 && !onControl(e.target) ? e.touches[0] : undefined, e.target)}
      onTouchMove={(e) => swipeMove(e.touches[0])}
      onTouchEnd={(e) => swipeEnd(e.changedTouches[0], e.target)}
      onTouchCancel={(e) => swipeEnd(undefined, e.target)}
      onMouseDown={(e) => swipeStart(e.button === 0 && !onControl(e.target) ? e : undefined, e.target)}
      onMouseUp={(e) => swipeEnd(e, e.target)}
      className="relative h-full overflow-hidden transition-colors duration-300"
      // Sideways finger drags turn pages here, not the browser's own swipe (e.g. back).
      style={{ background: colors.bg, color: colors.ink, touchAction: "pan-y pinch-zoom", overscrollBehavior: "none" }}
    >
      <div
        ref={viewerRef}
        className="absolute inset-x-[calc(1.25rem*var(--keep))] inset-y-4 sm:inset-x-[calc(3.5rem*var(--keep))] sm:inset-y-6 lg:inset-x-[calc(4rem*var(--keep))] lg:inset-y-8"
        style={{ "--keep": 1 - trim } as React.CSSProperties}
      />

      {/* Small page-turn buttons for mouse users, while the big ones are hidden. */}
      {/* Only while the margins are wide enough to hold them: trimmed, they'd sit on the text. */}
      {!buttons && trim <= MAX_TRIM_WITH_BUTTONS && (
        <>
          <PageButton side="left" onClick={() => turn(-1)} />
          <PageButton side="right" onClick={() => turn(1)} />
        </>
      )}
      {/* Big ones, on any screen, after a tap in the middle. Using them keeps them up. */}
      {(["left", "right"] as const).map((side) => (
        <BigPageButton
          key={side}
          side={side}
          shown={buttons}
          colors={colors}
          onClick={() => {
            turn(side === "left" ? -1 : 1);
            setButtonsUsed((n) => n + 1);
          }}
        />
      ))}

      {menu?.kind === "new" && (
        <HighlightMenu
          anchor={menu.anchor}
          scrollerRef={wrapRef}
          onColor={(color) => {
            props.onAddHighlight(menu.draft, color);
            finish();
          }}
          onCopy={() => copy(menu.draft.text)}
          onTranslate={() => setMenu({ kind: "translate", text: menu.draft.text, anchor: menu.anchor })}
          onSpeak={canSpeak ? () => startSpeaking(menu.draft.text, menu.anchor) : undefined}
        />
      )}
      {menu?.kind === "speak" && <SpeakCard text={menu.text} anchor={menu.anchor} scrollerRef={wrapRef} onClose={finish} />}
      {menu?.kind === "translate" && (
        <TranslateCard key={menu.text} text={menu.text} anchor={menu.anchor} scrollerRef={wrapRef} onClose={finish} />
      )}
      {editing && menu && (
        <HighlightMenu
          anchor={menu.anchor}
          scrollerRef={wrapRef}
          current={editing.color}
          onColor={(color) => {
            props.onRecolorHighlight(editing.id, color);
            finish();
          }}
          onCopy={() => copy(editing.text)}
          onTranslate={() => setMenu({ kind: "translate", text: editing.text, anchor: menu.anchor })}
          onSpeak={canSpeak ? () => startSpeaking(editing.text, menu.anchor) : undefined}
          onDelete={() => {
            props.onRemoveHighlight(editing.id);
            finish();
          }}
        />
      )}
    </div>
  );
}

function PageButton({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Previous page" : "Next page"}
      className={`absolute top-1/2 hidden size-10 -translate-y-1/2 place-items-center rounded-full opacity-40 transition hover:bg-black/5 hover:opacity-90 sm:grid ${
        side === "left" ? "left-2 lg:left-3" : "right-2 lg:right-3"
      }`}
    >
      <Icon className="size-6" />
    </button>
  );
}

/** A large, solid page-turn button for fingers; it fades in and out. */
function BigPageButton({
  side,
  shown,
  colors,
  onClick,
}: {
  side: "left" | "right";
  shown: boolean;
  colors: { bg: string; ink: string };
  onClick: () => void;
}) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Previous page" : "Next page"}
      style={{ background: colors.bg, color: colors.ink }}
      className={`absolute top-1/2 z-10 grid size-14 -translate-y-1/2 place-items-center rounded-full shadow-lg ring-1 ring-black/10 transition-[opacity,visibility] duration-200 active:scale-95 ${
        shown ? "visible opacity-95" : "invisible opacity-0"
      } ${side === "left" ? "left-3" : "right-3"}`}
    >
      <Icon className="size-8" />
    </button>
  );
}

const cfiOrder = new EpubCFI();

/**
 * Shows the page with `cfi` on it. epub.js can land a page (or a two-page spread) early: when
 * the CFI points into a paragraph that began on an earlier page, it goes to where the paragraph
 * starts. So, while the place is still after what's shown, turn forward.
 */
async function showCfi(rendition: Rendition, cfi: string) {
  await rendition.display(cfi);
  for (let i = 0; i < 3; i++) {
    const loc = rendition.currentLocation() as unknown as Location | undefined;
    if (!loc?.end || loc.atEnd || cfiOrder.compare(cfi, loc.end.cfi) <= 0) return;
    await rendition.next();
  }
}

/**
 * What's on screen. `cfi`: the first character on screen (or picture, on a page without words).
 * epub.js's own start position (location.start.cfi) is where the first paragraph on screen
 * begins, which may be on an earlier page: saving that reopened the book a page (or a two-page
 * spread) early. `blank`: nothing at all on screen.
 */
function readPage(rendition: Rendition, viewer: HTMLElement): { cfi: string | null; blank: boolean } {
  const v = viewer.getBoundingClientRect();
  for (const contents of allContents(rendition)) {
    const frame = contents.window.frameElement;
    if (!frame) continue;
    const fx = frame.getBoundingClientRect().left;
    const before = (r: DOMRect) => fx + r.right <= v.left + 1;
    const after = (r: DOMRect) => fx + r.left >= v.right - 1;
    const onScreen = (r: DOMRect) => r.width > 0 && !before(r) && !after(r);
    const doc = contents.document;
    const range = doc.createRange();
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
      if (!node.data.trim()) continue;
      range.selectNodeContents(node);
      if (![...range.getClientRects()].some(onScreen)) continue;
      // Pages are columns left to right, so the characters before the screen come first.
      // (In a right-to-left book this finds the node's start, which is still on screen.)
      let lo = 0;
      let hi = node.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        range.setStart(node, mid);
        range.setEnd(node, mid + 1);
        if (before(range.getBoundingClientRect())) lo = mid + 1;
        else hi = mid;
      }
      while (lo < node.length - 1 && /\s/.test(node.data[lo])) lo++;
      range.setStart(node, lo);
      range.collapse(true);
      return { cfi: safely(() => contents.cfiFromRange(range)), blank: false };
    }
    for (const el of doc.body.querySelectorAll("img, svg, image, video")) {
      if ([...el.getClientRects()].some(onScreen)) return { cfi: safely(() => contents.cfiFromNode(el)), blank: false };
    }
  }
  return { cfi: null, blank: allContents(rendition).length > 0 };
}

function safely(make: () => string) {
  try {
    return make();
  } catch {
    return null;
  }
}

/**
 * A chapter's HTML with our <style> at the end of its <head>, so it wins over the book's own CSS.
 * The book's scripts are taken out, and a policy at the top of <head> stops any left (inline
 * handlers, javascript: links) from running: the frame may run scripts, but only ours.
 */
function withStyle(html: string, css: string) {
  const policy = `<meta http-equiv="Content-Security-Policy" content="script-src 'none'; object-src 'none'"/>`;
  html = html.replace(/<script\b[^>]*\/>|<script\b[\s\S]*?<\/script\s*>/gi, "");
  const open = html.search(/<head\b[^>]*>/i);
  html = open >= 0 ? html.replace(/<head\b[^>]*>/i, (tag) => tag + policy) : policy + html;
  const tag = `<style id="pata-look">${css}</style>`;
  const head = html.search(/<\/head\s*>/i);
  return head >= 0 ? html.slice(0, head) + tag + html.slice(head) : tag + html;
}

/**
 * Space between pages (half of it on each side of a page), in px. epub.js's own is 1/12 of the
 * width; trimming shrinks it, keeping a little so two pages side by side don't touch.
 */
function gapFor(width: number, trim: number) {
  if (!trim) return undefined; // epub.js's default
  const full = Math.floor(width / 12);
  return Math.max(16, Math.round(full * (1 - trim)));
}

/** Buttons and menus over the book: presses on them aren't swipes or page taps. */
function onControl(target: EventTarget | null) {
  return !!(target as Element | null)?.closest?.("button, [role=toolbar], [role=dialog], [role=group]");
}

/** The document an event happened in: ours, or a chapter's iframe. */
function docOf(target: EventTarget | null) {
  const node = target as Node | null;
  return node?.nodeType === Node.DOCUMENT_NODE ? (node as Document) : (node?.ownerDocument ?? null);
}

/** epub.js types say one Contents; it's really one per chapter on screen. */
function allContents(rendition: Rendition): Contents[] {
  const c = rendition.getContents() as unknown as Contents[] | Contents;
  return Array.isArray(c) ? c : c ? [c] : [];
}

/** The newest highlight in this chapter under a point (iframe coordinates); it's drawn on top. */
function highlightAt(highlights: Highlight[], contents: Contents, x: number, y: number) {
  const pad = 2;
  let hit: Highlight | null = null;
  for (const h of highlights) {
    if (!h.cfi || h.page !== contents.sectionIndex + 1) continue;
    let rects: DOMRectList;
    try {
      rects = contents.range(h.cfi).getClientRects();
    } catch {
      continue;
    }
    const inside = [...rects].some(
      (r) => x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad,
    );
    if (inside && (!hit || h.createdAt > hit.createdAt)) hit = h;
  }
  return hit;
}
