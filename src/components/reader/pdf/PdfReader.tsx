"use client";

import { ArrowLeft, PanelLeft } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { saveProgress, updateBook } from "@/lib/library/local";
import type { Book } from "@/lib/library/types";
import { clampZoom, loadPrefs, nextZoom, savePrefs, type PdfFit } from "@/lib/reader/prefs";
import { useDebouncedSave } from "@/lib/useDebouncedSave";
import { PdfSidebar } from "./PdfSidebar";
import PdfScrollView, { type PdfScrollHandle } from "./PdfScrollView";

type Props = { book: Book; file: Blob; initialPage: number; cover: string | null };

const isDesktop = () => window.matchMedia("(min-width: 1024px)").matches;

export default function PdfReader({ book, file, initialPage, cover }: Props) {
  const scrollView = useRef<PdfScrollHandle>(null);
  const [page, setPage] = useState(initialPage);
  const [numPages, setNumPages] = useState(book.pageCount ?? 0);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [scale, setScale] = useState(1);
  const [prefs, setPrefs] = useState(loadPrefs);
  const [trim, setTrim] = useState(book.pdfTrim ?? 0);
  // Phones always start with the panel closed so the page gets the whole screen.
  const [sidebarOpen, setOpenState] = useState(() => prefs.sidebarOpen && isDesktop());
  // The Contents/Pages lists only exist while the panel is open (plus 300ms so the closing
  // slide still shows them). A closed phone drawer used to keep drawing thumbnails while you read.
  const [listsMounted, setListsMounted] = useState(sidebarOpen);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const setSidebarOpen = useCallback((open: boolean) => {
    setOpenState(open);
    clearTimeout(closeTimer.current);
    if (open) setListsMounted(true);
    else closeTimer.current = setTimeout(() => setListsMounted(false), 300);
  }, []);
  useEffect(() => () => clearTimeout(closeTimer.current), []);

  useEffect(() => savePrefs(prefs), [prefs]);

  const scheduleSave = useDebouncedSave((p: number) =>
    saveProgress(book.id, {
      position: String(p),
      percent: numPages ? Math.round((p / numPages) * 1000) / 10 : 0,
      updatedAt: Date.now(),
    }),
  );

  const handleLoad = useCallback(
    (doc: PDFDocumentProxy) => {
      setPdf(doc);
      setNumPages(doc.numPages);
      if (book.pageCount !== doc.numPages) void updateBook(book.id, { pageCount: doc.numPages });
    },
    [book.id, book.pageCount],
  );

  const handlePageChange = useCallback(
    (p: number) => {
      setPage(p);
      scheduleSave(p);
    },
    [scheduleSave],
  );

  const goToPage = useCallback(
    (target: number) => {
      if (!numPages) return;
      const n = Math.min(Math.max(1, target), numPages);
      scrollView.current?.scrollToPage(n, Math.abs(n - page) <= 1);
      if (!isDesktop()) setSidebarOpen(false); // show the page on phones
    },
    [numPages, page, setSidebarOpen],
  );

  const zoom = useCallback(
    (dir: 1 | -1) => setPrefs((p) => ({ ...p, pdfFit: "custom", pdfZoom: nextZoom(scale, dir) })),
    [scale],
  );
  const zoomTo = (pdfZoom: number) => setPrefs((p) => ({ ...p, pdfFit: "custom", pdfZoom: clampZoom(pdfZoom) }));
  const setFit = (pdfFit: PdfFit) => setPrefs((p) => ({ ...p, pdfFit }));

  function changeTrim(value: number) {
    setTrim(value);
    void updateBook(book.id, { pdfTrim: value }); // per book: every book has different margins
  }

  function toggleSidebar() {
    const open = !sidebarOpen;
    setSidebarOpen(open);
    if (isDesktop()) setPrefs((p) => ({ ...p, sidebarOpen: open }));
  }

  // Ctrl/Cmd + / − / 0 zoom the book instead of the whole browser page.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === "=" || e.key === "+") zoom(1);
      else if (e.key === "-") zoom(-1);
      else if (e.key === "0") setPrefs((p) => ({ ...p, pdfFit: "auto" }));
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom]);

  const percent = numPages ? (page / numPages) * 100 : 0;

  return (
    <div className="flex h-dvh flex-col bg-surface-2">
      <header className="relative z-20 flex h-14 shrink-0 items-center gap-1 border-b border-border bg-surface/85 px-2 backdrop-blur-xl sm:gap-2 sm:px-3">
        <Link
          href="/library"
          aria-label="Back to library"
          className="grid size-9 place-items-center rounded-full text-muted transition hover:bg-surface-2 hover:text-ink"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={sidebarOpen ? "Hide panel" : "Show panel"}
          aria-expanded={sidebarOpen}
          className={`grid size-9 place-items-center rounded-full transition hover:bg-surface-2 hover:text-ink ${
            sidebarOpen ? "text-ink" : "text-muted"
          }`}
        >
          <PanelLeft className="size-5" />
        </button>
        <h1 className="ml-1 min-w-0 flex-1 truncate font-serif text-[17px]">{book.title}</h1>
        {numPages > 0 && (
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="shrink-0 rounded-full bg-surface-2 px-3 py-1 text-xs tabular-nums text-muted transition hover:text-ink"
          >
            {page} / {numPages}
          </button>
        )}
        <div className="absolute inset-x-0 bottom-0 h-0.5">
          <div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${percent}%` }} />
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* Phone: the panel is a drawer over the page, with a dimmed backdrop. */}
        {sidebarOpen && (
          <div
            aria-hidden
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 z-30 bg-black/40 backdrop-blur-[2px] lg:hidden"
          />
        )}
        <aside
          aria-label="Reader controls"
          className={`fixed inset-y-0 left-0 z-40 w-80 max-w-[88vw] shrink-0 border-r border-border bg-surface shadow-2xl transition-transform duration-300 ease-out lg:static lg:z-auto lg:shadow-none lg:transition-none ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full lg:hidden"
          }`}
        >
          <PdfSidebar
            active={listsMounted}
            pdf={pdf}
            tab={prefs.sidebarTab}
            onTab={(sidebarTab) => setPrefs((p) => ({ ...p, sidebarTab }))}
            title={book.title}
            cover={cover}
            page={page}
            numPages={numPages}
            scale={scale}
            fit={prefs.pdfFit}
            trim={trim}
            onGoTo={goToPage}
            onZoom={zoom}
            onZoomTo={zoomTo}
            onFit={setFit}
            onTrim={changeTrim}
            onClose={() => setSidebarOpen(false)}
          />
        </aside>

        <div className="min-h-0 min-w-0 flex-1">
          <PdfScrollView
            ref={scrollView}
            file={file}
            title={book.title}
            initialPage={initialPage}
            fit={prefs.pdfFit}
            zoom={prefs.pdfZoom}
            trim={trim}
            onLoad={handleLoad}
            onPageChange={handlePageChange}
            onScaleChange={setScale}
          />
        </div>
      </div>
    </div>
  );
}
