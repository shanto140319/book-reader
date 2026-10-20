"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { library } from "@/lib/library";
import type { Book, Highlight } from "@/lib/library/types";
import { clampZoom, nextZoom, savePrefs, type PdfFit, type ReaderPrefs } from "@/lib/reader/prefs";
import { useDebouncedSave } from "@/lib/useDebouncedSave";
import { HeaderPill, isDesktop, ReaderShell, useReaderSidebar } from "../shared/ReaderShell";
import { useHighlights } from "../shared/useHighlights";
import { PdfSidebar } from "./PdfSidebar";
import PdfScrollView, { type PdfScrollHandle } from "./PdfScrollView";

type Props = { book: Book; file: Blob; initialPage: number; cover: string | null; initialPrefs: ReaderPrefs };

const NO_HIGHLIGHTS: Highlight[] = [];

export default function PdfReader({ book, file, initialPage, cover, initialPrefs }: Props) {
  const scrollView = useRef<PdfScrollHandle>(null);
  const [page, setPage] = useState(initialPage);
  const [numPages, setNumPages] = useState(book.pageCount ?? 0);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [scale, setScale] = useState(1);
  const [prefs, setPrefs] = useState(initialPrefs);
  const [trim, setTrim] = useState(book.pdfTrim ?? 0);
  // The Contents/Pages lists only exist while the panel is open: a closed phone drawer used to
  // keep drawing thumbnails while you read.
  const { open: sidebarOpen, listsMounted, setOpen: setSidebarOpen } = useReaderSidebar(initialPrefs.sidebarOpen);

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

  const { highlights, notice, addHighlight, recolorHighlight, removeHighlight } = useHighlights(book.id);

  function goToHighlight(h: Highlight) {
    scrollView.current?.scrollToHighlight(h, Math.abs(h.page - page) <= 1);
    if (!isDesktop()) setSidebarOpen(false);
  }

  const percent = numPages ? (page / numPages) * 100 : 0;

  return (
    <ReaderShell
      title={book.title}
      percent={percent}
      pill={
        numPages > 0 && (
          <HeaderPill onClick={() => setSidebarOpen(true)}>
            {page} / {numPages}
          </HeaderPill>
        )
      }
      sidebarOpen={sidebarOpen}
      onToggleSidebar={toggleSidebar}
      onCloseSidebar={() => setSidebarOpen(false)}
      notice={notice}
      sidebar={
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
      }
    >
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
    </ReaderShell>
  );
}
