"use client";

import { BookX } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { library } from "@/lib/library";
import type { Book } from "@/lib/library/types";
import { loadPrefs, type ReaderPrefs } from "@/lib/reader/prefs";
import { BookLoader } from "./BookLoader";

// PDF.js and epub.js need browser APIs (canvas, Web Workers, iframes), so the readers are loaded
// only in the browser. `ssr: false` is only allowed inside Client Components.
const PdfReader = dynamic(() => import("./pdf/PdfReader"), { ssr: false, loading: () => <BookLoader /> });
const EpubReader = dynamic(() => import("./epub/EpubReader"), { ssr: false, loading: () => <BookLoader /> });

type State =
  | { status: "loading" }
  | { status: "missing" }
  // position: PDF page number as text, or EPUB CFI; null when the book hasn't been opened yet
  | { status: "ready"; book: Book; file: Blob; position: string | null; cover: string | null; prefs: ReaderPrefs };

export function ReaderLoader({ bookId }: { bookId: string }) {
  const [state, setState] = useState<State>({ status: "loading" });

  // With Cache Components, Next.js doesn't unmount this route when you leave it: it hides it
  // with React <Activity> and shows the same instance when you come back. Effects still clean
  // up on hide and re-run on show, so this effect runs on every visit and loads the latest
  // saved position. The cleanup resets to "loading", which unmounts the reader (freeing the
  // PDF from memory) so the next visit starts fresh instead of reusing stale scroll state.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      library.getBook(bookId).then(async (book) => ({ book, file: book && (await library.getBookFile(book)) })),
      library.getProgress(bookId),
      library.getCover(bookId),
      loadPrefs(),
    ]).then(
      ([{ book, file }, progress, cover, prefs]) => {
        if (cancelled) return;
        if (!book || !file) return setState({ status: "missing" });
        setState({ status: "ready", book, file, position: progress?.position ?? null, cover: cover || null, prefs });
      },
      () => !cancelled && setState({ status: "missing" }),
    );
    return () => {
      cancelled = true;
      setState({ status: "loading" });
    };
  }, [bookId]);

  if (state.status === "loading") return <BookLoader />;
  if (state.status === "missing") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
        <span className="grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent">
          <BookX className="size-6" strokeWidth={1.8} />
        </span>
        <h1 className="mt-5 font-serif text-2xl">Book not found</h1>
        <p className="mt-1.5 text-sm text-muted">It may have been deleted, or the connection dropped. Please try again.</p>
        <Link href="/library" className="mt-6 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-bg">
          Back to library
        </Link>
      </div>
    );
  }
  if (state.book.fileType === "epub") {
    return (
      <EpubReader
        book={state.book}
        file={state.file}
        initialCfi={state.position}
        cover={state.cover}
        initialPrefs={state.prefs}
      />
    );
  }
  const saved = Number(state.position);
  return (
    <PdfReader
      book={state.book}
      file={state.file}
      initialPage={Number.isInteger(saved) && saved > 0 ? saved : 1}
      cover={state.cover}
      initialPrefs={state.prefs}
    />
  );
}
