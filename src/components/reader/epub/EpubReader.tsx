"use client";

import { BookX } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Book as EpubBook, Location } from "epubjs";
import { library } from "@/lib/library";
import { getSavedLocations, saveLocations } from "@/lib/library/epub-locations";
import type { Book, Highlight } from "@/lib/library/types";
import { chaptersBySpine, type EpubLook, type TocItem } from "@/lib/reader/epub";
import { EPUB_FONT_SIZES, savePrefs, type ReaderPrefs } from "@/lib/reader/prefs";
import { useDebouncedSave } from "@/lib/useDebouncedSave";
import { BookLoader } from "../BookLoader";
import { HeaderPill, isDesktop, ReaderShell, useReaderSidebar } from "../shared/ReaderShell";
import { useHighlights } from "../shared/useHighlights";
import { EpubSidebar } from "./EpubSidebar";
import EpubView, { type EpubViewHandle } from "./EpubView";

type Props = { book: Book; file: Blob; initialCfi: string | null; cover: string | null; initialPrefs: ReaderPrefs };

type Opened = { epub: EpubBook; toc: TocItem[]; spineHrefs: string[] };

/** Characters per location: the grain of reading percentages (epub.js's usual value). */
const LOCATION_CHARS = 1600;

const NO_HIGHLIGHTS: Highlight[] = [];

export default function EpubReader({ book, file, initialCfi, cover, initialPrefs }: Props) {
  const view = useRef<EpubViewHandle>(null);
  const [opened, setOpened] = useState<Opened | null>(null);
  const [failed, setFailed] = useState(false);
  const [locationsReady, setLocationsReady] = useState(false);
  const [location, setLocation] = useState<Location | null>(null);
  const [prefs, setPrefs] = useState(initialPrefs);
  const { open: sidebarOpen, listsMounted, setOpen: setSidebarOpen } = useReaderSidebar(initialPrefs.sidebarOpen);
  const { highlights, notice, addHighlight, recolorHighlight, removeHighlight } = useHighlights(book.id);

  // ─── Open the book ──────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    let epub: EpubBook | null = null;
    (async () => {
      const { openEpub } = await import("@/lib/library/epub");
      epub = await openEpub(file);
      if (cancelled) return epub.destroy();
      const nav = await epub.loaded.navigation;
      const spineHrefs: string[] = [];
      epub.spine.each((item: { href: string }) => spineHrefs.push(item.href));
      if (cancelled) return;
      setOpened({ epub, toc: nav.toc as TocItem[], spineHrefs });
    })().catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      // React cleans up this (parent) effect before the view's, and destroying the book
      // first pulls it out from under the view. A moment later, the view is done with it.
      const opened = epub;
      setTimeout(() => opened?.destroy(), 0);
    };
  }, [file]);

  // Reading percentages: this browser's saved copy, or worked out once in the background.
  // Started after the first page is on screen, since working them out reads the whole book.
  const shown = location !== null;
  useEffect(() => {
    const epub = opened?.epub;
    if (!epub || !shown) return;
    let cancelled = false;
    (async () => {
      const saved = await getSavedLocations(book.id);
      if (cancelled) return;
      if (saved) {
        epub.locations.load(saved);
      } else {
        await epub.locations.generate(LOCATION_CHARS);
        if (cancelled) return;
        void saveLocations(book.id, epub.locations.save());
      }
      setLocationsReady(true);
    })().catch(() => {}); // no exact percentages: the rough ones stay
    return () => {
      cancelled = true;
    };
  }, [opened, shown, book.id]);

  const chapters = useMemo(() => (opened ? chaptersBySpine(opened.toc, opened.spineHrefs) : []), [opened]);
  const chapter = location ? (chapters[location.start.index] ?? null) : null;

  // ─── Position and progress ──────────────────────────────────────────────────

  /** Exact percent read at a position, or null until the book's locations are worked out. */
  const percentOf = useCallback(
    (loc: Location) => (opened && locationsReady ? opened.epub.locations.percentageFromCfi(loc.start.cfi) * 100 : null),
    [opened, locationsReady],
  );
  const percent = location ? percentOf(location) : null;

  /** Until the exact percentages are ready: how far through the chapter files we are. */
  function roughPercent(loc: Location) {
    const total = opened?.spineHrefs.length || 1;
    const { page, total: pages } = loc.start.displayed;
    return ((loc.start.index + (pages ? (page - 1) / pages : 0)) / total) * 100;
  }

  const scheduleSave = useDebouncedSave(({ loc, cfi }: { loc: Location; cfi: string }) =>
    library.saveProgress(book.id, {
      position: cfi,
      percent: Math.round(Math.min(100, Math.max(0, loc.atEnd ? 100 : (percentOf(loc) ?? roughPercent(loc)))) * 10) / 10,
      updatedAt: Date.now(),
    }),
  );

  // Opening the book where it was left isn't progress, so nothing is saved until the reader moves.
  const moved = useRef(false);
  const position = useRef<{ loc: Location; cfi: string } | null>(null);
  const handleRelocated = useCallback(
    (loc: Location, cfi: string) => {
      setLocation(loc);
      position.current = { loc, cfi };
      moved.current ||= cfi !== initialCfi;
      if (moved.current) scheduleSave(position.current);
    },
    [initialCfi, scheduleSave],
  );

  // Exact percentages just arrived: save the current position with its real percent.
  useEffect(() => {
    if (locationsReady && position.current && moved.current) scheduleSave(position.current);
    // only when they arrive
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationsReady]);

  // ─── Preferences ────────────────────────────────────────────────────────────

  // Save changes only (not the prefs we just loaded), so opening a book doesn't write to the server.
  const loadedPrefs = useRef(initialPrefs);
  useEffect(() => {
    if (prefs !== loadedPrefs.current) savePrefs(prefs);
  }, [prefs]);

  const appDark = useSyncExternalStore(subscribeDark, isDark, () => false);
  const autoTheme = appDark ? "dark" : "light";
  const look: EpubLook = useMemo(
    () => ({
      theme: prefs.epubTheme === "auto" ? autoTheme : prefs.epubTheme,
      font: prefs.epubFont,
      fontSize: prefs.epubFontSize,
      fontWeight: prefs.epubFontWeight,
      letterSpacing: prefs.epubLetterSpacing,
      lineHeight: prefs.epubLineHeight,
    }),
    [
      prefs.epubTheme,
      prefs.epubFont,
      prefs.epubFontSize,
      prefs.epubFontWeight,
      prefs.epubLetterSpacing,
      prefs.epubLineHeight,
      autoTheme,
    ],
  );

  // Ctrl/Cmd + / − / 0 change the text size instead of zooming the whole browser page.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      const step = (dir: 1 | -1) =>
        setPrefs((p) => {
          // The slider allows sizes between the steps (115%…): go to the next step either way.
          const size = p.epubFontSize;
          const next =
            dir > 0
              ? (EPUB_FONT_SIZES.find((s) => s > size) ?? EPUB_FONT_SIZES.at(-1)!)
              : (EPUB_FONT_SIZES.findLast((s) => s < size) ?? EPUB_FONT_SIZES[0]);
          return { ...p, epubFontSize: next };
        });
      if (e.key === "=" || e.key === "+") step(1);
      else if (e.key === "-") step(-1);
      else if (e.key === "0") setPrefs((p) => ({ ...p, epubFontSize: 100 }));
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function toggleSidebar() {
    const open = !sidebarOpen;
    setSidebarOpen(open);
    if (isDesktop()) setPrefs((p) => ({ ...p, sidebarOpen: open }));
  }

  // ─── Navigation ─────────────────────────────────────────────────────────────

  function goTo(target: string) {
    view.current?.display(target);
    if (!isDesktop()) setSidebarOpen(false); // show the page on phones
  }

  const chapterOf = useCallback((h: Highlight) => chapters[h.page - 1]?.label.trim() || null, [chapters]);

  if (failed) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
        <span className="grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent">
          <BookX className="size-6" strokeWidth={1.8} />
        </span>
        <h1 className="mt-5 font-serif text-2xl">This book couldn&apos;t be opened</h1>
        <p className="mt-1.5 text-sm text-muted">The EPUB file may be damaged.</p>
        <Link href="/library" className="mt-6 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-bg">
          Back to library
        </Link>
      </div>
    );
  }
  if (!opened) return <BookLoader title={book.title} />;

  const tab = prefs.sidebarTab === "pages" ? "contents" : prefs.sidebarTab;
  const shownPercent = location ? (percent ?? roughPercent(location)) : 0;
  const pillText = chapter?.label.trim() || (percent !== null ? `${Math.round(percent)}%` : null);

  return (
    <ReaderShell
      title={book.title}
      percent={shownPercent}
      pill={
        pillText && (
          <HeaderPill onClick={() => setSidebarOpen(true)}>
            {pillText}
            {chapter && percent !== null && <span className="text-subtle"> · {Math.round(percent)}%</span>}
          </HeaderPill>
        )
      }
      sidebarOpen={sidebarOpen}
      onToggleSidebar={toggleSidebar}
      onCloseSidebar={() => setSidebarOpen(false)}
      notice={notice}
      sidebar={
        <EpubSidebar
          active={listsMounted}
          tab={tab}
          onTab={(sidebarTab) => setPrefs((p) => ({ ...p, sidebarTab }))}
          title={book.title}
          author={book.author}
          cover={cover}
          percent={percent}
          toc={opened.toc}
          chapter={chapter}
          onGoTo={goTo}
          highlights={highlights}
          chapterOf={chapterOf}
          onGoToHighlight={(h) => h.cfi && goTo(h.cfi)}
          onRemoveHighlight={removeHighlight}
          prefs={prefs}
          autoTheme={autoTheme}
          onPrefs={(patch) => setPrefs((p) => ({ ...p, ...patch }))}
          onClose={() => setSidebarOpen(false)}
        />
      }
    >
      <EpubView
        ref={view}
        book={opened.epub}
        initialCfi={initialCfi}
        look={look}
        trim={prefs.epubTrim}
        onRelocated={handleRelocated}
        highlights={highlights ?? NO_HIGHLIGHTS}
        onAddHighlight={addHighlight}
        onRecolorHighlight={recolorHighlight}
        onRemoveHighlight={removeHighlight}
      />
    </ReaderShell>
  );
}

// The app's own light/dark: a saved choice on <html data-theme>, otherwise the system setting.
const darkQuery = () => window.matchMedia("(prefers-color-scheme: dark)");
function isDark() {
  const forced = document.documentElement.dataset.theme;
  return forced ? forced === "dark" : darkQuery().matches;
}
function subscribeDark(onChange: () => void) {
  const query = darkQuery();
  query.addEventListener("change", onChange);
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => {
    query.removeEventListener("change", onChange);
    observer.disconnect();
  };
}
