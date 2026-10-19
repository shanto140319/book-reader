"use client";

import { useEffect, useRef, useState } from "react";
import { Page } from "react-pdf";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { revealInSidebar } from "@/lib/reader/scroll";

const THUMB_WIDTH = 124;

type Props = {
  pdf: PDFDocumentProxy;
  numPages: number;
  currentPage: number;
  onSelect: (page: number) => void;
};

/**
 * Page previews in two columns. Like the main view, only thumbnails in (or near) the visible
 * part of the list are drawn, so a 600-page book doesn't render 600 canvases.
 */
export function PdfThumbnails({ pdf, numPages, currentPage, onSelect }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const itemEls = useRef(new Map<number, HTMLElement>());
  const [ratio, setRatio] = useState<number | null>(null); // page 1 height / width, sizes every placeholder
  const [visible, setVisible] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    let cancelled = false;
    pdf.getPage(1).then((p) => {
      const { width, height } = p.getViewport({ scale: 1 });
      if (!cancelled) setRatio(height / width);
    });
    return () => {
      cancelled = true;
    };
  }, [pdf]);

  // Which thumbnails are on screen. The list scrolls inside the sidebar, whose scroll area is
  // the nearest scrolling ancestor; rootMargin pre-draws a few rows above and below.
  useEffect(() => {
    if (!ratio) return;
    const observer = new IntersectionObserver(
      (entries) =>
        setVisible((prev) => {
          const next = new Set(prev);
          for (const e of entries) {
            const n = Number((e.target as HTMLElement).dataset.thumb);
            if (e.isIntersecting) next.add(n);
            else next.delete(n);
          }
          return next;
        }),
      { root: listRef.current?.closest("[data-sidebar-scroll]") ?? null, rootMargin: "400px 0px" },
    );
    itemEls.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [ratio, numPages]);

  // Keep the current page's thumbnail in view as you read (centred the first time).
  const shownOnce = useRef(false);
  useEffect(() => {
    const el = itemEls.current.get(currentPage);
    if (!el) return;
    revealInSidebar(el, shownOnce.current ? "nearest" : "center");
    shownOnce.current = true;
  }, [currentPage, ratio]);

  if (!ratio) return null;

  return (
    <div ref={listRef} className="grid grid-cols-2 justify-items-center gap-x-3 gap-y-5 p-4">
      {Array.from({ length: numPages }, (_, i) => {
        const n = i + 1;
        const active = n === currentPage;
        return (
          <button
            key={n}
            type="button"
            data-thumb={n}
            ref={(el) => {
              if (el) itemEls.current.set(n, el);
              else itemEls.current.delete(n);
            }}
            onClick={() => onSelect(n)}
            aria-label={`Page ${n}`}
            aria-current={active ? "page" : undefined}
            className="group flex flex-col items-center gap-1.5 scroll-my-4"
          >
            <span
              className={`relative block overflow-hidden rounded-[3px] bg-white transition ${
                active
                  ? "ring-2 ring-accent ring-offset-2 ring-offset-surface"
                  : "ring-1 ring-border group-hover:ring-2 group-hover:ring-subtle"
              } shadow-[0_4px_12px_-6px_rgb(0_0_0/0.3)]`}
              style={{ width: THUMB_WIDTH, height: Math.round(THUMB_WIDTH * ratio) }}
            >
              {visible.has(n) && (
                <Page
                  pdf={pdf}
                  suspense={false}
                  pageNumber={n}
                  width={THUMB_WIDTH}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                  loading=""
                />
              )}
            </span>
            <span className={`text-[11px] tabular-nums ${active ? "font-semibold text-accent" : "text-subtle"}`}>{n}</span>
          </button>
        );
      })}
    </div>
  );
}
