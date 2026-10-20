"use client";

import { ArrowLeft, PanelLeft } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { library } from "@/lib/library";
import type { Book, Highlight, HighlightColor } from "@/lib/library/types";
import type { HighlightDraft } from "@/lib/reader/highlights";
import { clampZoom, nextZoom, savePrefs, type PdfFit, type ReaderPrefs } from "@/lib/reader/prefs";
import { useDebouncedSave } from "@/lib/useDebouncedSave";
import { PdfSidebar } from "./PdfSidebar";
import PdfScrollView, { type PdfScrollHandle } from "./PdfScrollView";

type Props = { book: Book; file: Blob; initialPage: number; cover: string | null; initialPrefs: ReaderPrefs };

const NO_HIGHLIGHTS: Highlight[] = [];

const isDesktop = () => window.matchMedia("(min-width: 1024px)").matches;

export default function PdfReader({ book, file, initialPage, cover, initialPrefs }: Props) {
  const scrollView = useRef<PdfScrollHandle>(null);
  const [page, setPage] = useState(initialPage);
  const [numPages, setNumPages] = useState(book.pageCount ?? 0);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [scale, setScale] = useState(1);
  const [prefs, setPrefs] = useState(initialPrefs);
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

  // Save changes only (not the prefs we just loaded), so opening a book doesn't write to the server.
  const loadedPrefs = useRef(initialPrefs);
  useEffect(() => {
    if (prefs !== loadedPrefs.current) savePrefs(prefs);
  }, [prefs]);

  const scheduleSave = useDebouncedSave((p: number) =>
    library.saveProgress(book.id, {
      position: String(p),
      percent: numPages ? Math.round((p / numPages) * 1000) / 10 : 0,
      updatedAt: Date.now(),
    }),
  );

  const handleLoad = useCallback(
    (doc: PDFDocumentProxy) => {
      setPdf(doc);
      setNumPages(doc.numPages);
      if (book.pageCount !== doc.numPages) void library.updateBook(book.id, { pageCount: doc.numPages });
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

  // Per book: every book has different margins. Debounced, since dragging the slider fires a lot.
  const scheduleTrimSave = useDebouncedSave((pdfTrim: number) => library.updateBook(book.id, { pdfTrim }), 800);
  function changeTrim(value: number) {
    setTrim(value);
    scheduleTrimSave(value);
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

  // ─── Highlights ─────────────────────────────────────────────────────────────
  // Changes show at once and are saved in the background; if a save fails it's undone
  // on screen too, with a short message, so what you see is what's stored.

  const [highlights, setHighlights] = useState<Highlight[] | null>(null); // null = loading
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    library.listHighlights(book.id).then(
      (loaded) => {
        if (cancelled) return;
        // Keep any highlight made while the list was still loading.
        setHighlights((prev) => [...loaded, ...(prev ?? []).filter((p) => !loaded.some((l) => l.id === p.id))]);
      },
      (error: Error) => {
        if (cancelled) return;
        setHighlights((prev) => prev ?? []);
        setNotice(error.message);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [book.id]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  const addHighlight = useCallback(
    (draft: HighlightDraft, color: HighlightColor) => {
      const now = Date.now();
      const h: Highlight = { id: crypto.randomUUID(), bookId: book.id, ...draft, color, createdAt: now, updatedAt: now };
      setHighlights((list) => [...(list ?? []), h]);
      library.addHighlight(h).catch((error: Error) => {
        setHighlights((list) => list?.filter((x) => x.id !== h.id) ?? null);
        setNotice(error.message);
      });
    },
    [book.id],
  );

  const recolorHighlight = useCallback(
    (id: string, color: HighlightColor) => {
      const before = highlights?.find((h) => h.id === id);
      if (!before) return;
      const set = (c: HighlightColor) => setHighlights((list) => list?.map((h) => (h.id === id ? { ...h, color: c } : h)) ?? null);
      set(color);
      library.updateHighlight(id, { color }).catch((error: Error) => {
        set(before.color);
        setNotice(error.message);
      });
    },
    [highlights],
  );

  const removeHighlight = useCallback(
    (id: string) => {
      const removed = highlights?.find((h) => h.id === id);
      if (!removed) return;
      setHighlights((list) => list?.filter((h) => h.id !== id) ?? null);
      library.deleteHighlight(id).catch((error: Error) => {
        setHighlights((list) => [...(list ?? []), removed]);
        setNotice(error.message);
      });
    },
    [highlights],
  );

  function goToHighlight(h: Highlight) {
    scrollView.current?.scrollToHighlight(h, Math.abs(h.page - page) <= 1);
    if (!isDesktop()) setSidebarOpen(false);
  }

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
            highlights={highlights}
            onGoToHighlight={goToHighlight}
            onRemoveHighlight={removeHighlight}
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
            highlights={highlights ?? NO_HIGHLIGHTS}
            onAddHighlight={addHighlight}
            onRecolorHighlight={recolorHighlight}
            onRemoveHighlight={removeHighlight}
          />
        </div>
      </div>

      {notice && (
        <div
          role="status"
          className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 mx-auto w-fit max-w-sm rounded-2xl bg-ink px-4 py-2.5 text-center text-sm text-bg shadow-lg"
        >
          {notice}
        </div>
      )}
    </div>
  );
}
