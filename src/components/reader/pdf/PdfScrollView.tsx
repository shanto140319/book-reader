"use client";

import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import type { PDFDocumentProxy } from "pdfjs-dist";
import "react-pdf/dist/Page/TextLayer.css";
import type { PdfFit } from "@/lib/reader/prefs";
import { BookLoader } from "../BookLoader";

// PDF.js parses and draws pages in a Web Worker so scrolling stays smooth.
// react-pdf requires this to be set in the same file that renders <Document>.
pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

/** Pages rendered on each side of the current page. Everything else is an empty placeholder. */
const RENDER_WINDOW = 2;
/** Page width at 100% / "Auto" on large screens (smaller screens use their full width). */
const AUTO_MAX_WIDTH = 920;
/** Longest canvas side in device pixels. Keeps memory sane at high zoom on big scanned books. */
const MAX_CANVAS_PX = 4096;

export type PdfScrollHandle = {
  scrollToPage: (page: number, smooth?: boolean) => void;
};

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

  useImperativeHandle(
    ref,
    () => ({
      scrollToPage(page, smooth = false) {
        const el = pageEls.current.get(page);
        scrollRef.current?.scrollTo({ top: el ? el.offsetTop - gap : 0, behavior: smooth ? "smooth" : "instant" });
      },
    }),
    [gap],
  );

  return (
    // `relative` makes this the offsetParent of the pages, so page.offsetTop is measured from
    // the top of the scroll area (not the whole window, which included the 56px header).
    <div ref={scrollRef} onScroll={handleScroll} className="relative h-full overflow-auto overscroll-contain">
      {/*
        suspense={false}: react-pdf 11 suspends by default, which hands loading to the
        nearest <Suspense> (the whole reader). That hid the reader and reset the scroll
        to the top whenever a new page started loading. With it off, each page shows its
        own `loading` placeholder inside its fixed-size box.
      */}
      <Document
        file={file}
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
              const height = renderWidth * (ratios[n] ?? base.ratio);
              const visible = Math.abs(n - currentPage) <= RENDER_WINDOW;
              return (
                <div
                  key={n}
                  data-page={n}
                  ref={(el) => {
                    if (el) pageEls.current.set(n, el);
                    else pageEls.current.delete(n);
                  }}
                  style={{ width: boxWidth, height }}
                  className="pdf-page relative shrink-0 overflow-hidden rounded-[2px] bg-white shadow-[0_1px_3px_rgb(0_0_0/0.1),0_10px_28px_-14px_rgb(0_0_0/0.28)]"
                >
                  {visible ? (
                    // Full-size page shifted left by `offset`; the box's overflow-hidden clips both sides.
                    <div className="absolute top-0" style={{ left: -offset, width: renderWidth }}>
                      <Page
                        suspense={false}
                        pageNumber={n}
                        width={renderWidth}
                        devicePixelRatio={dpr}
                        renderAnnotationLayer={false}
                        loading={<PagePlaceholder />}
                        onLoadSuccess={(page) => {
                          const ratio = page.originalHeight / page.originalWidth;
                          // Only store pages whose shape differs from page 1 (avoids needless re-renders).
                          if (Math.abs(ratio - base.ratio) > 0.01) setRatios((r) => ({ ...r, [n]: ratio }));
                        }}
                      />
                    </div>
                  ) : (
                    <PagePlaceholder />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Document>
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

const SKELETON_LINES = ["38%", "92%", "97%", "88%", "95%", "70%", "", "94%", "90%", "96%", "62%"];

/** Faint "text lines" shown while a page is drawing. */
function PagePlaceholder() {
  return (
    <div aria-hidden className="absolute inset-0 bg-white px-[9%] py-[11%]">
      {SKELETON_LINES.map((w, i) =>
        w ? (
          <div key={i} className="mb-3 h-2 animate-pulse rounded-full bg-neutral-100" style={{ width: w }} />
        ) : (
          <div key={i} className="h-4" />
        ),
      )}
    </div>
  );
}
