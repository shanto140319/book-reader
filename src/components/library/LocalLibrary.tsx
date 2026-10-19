"use client";

import { FileUp, Loader2, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { addBook, deleteBook, getBookFile, listBooks, setCover } from "@/lib/library/local";
import type { BookWithProgress } from "@/lib/library/types";
import { BookCard } from "./BookCard";

export function LocalLibrary() {
  const [books, setBooks] = useState<BookWithProgress[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => listBooks().then(setBooks), []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Make real covers (page 1) for books that don't have one yet: new uploads and books added
  // before covers existed. One at a time, each card updating as its cover is ready.
  const missingCovers = books?.filter((b) => b.cover === undefined).map((b) => b.id) ?? [];
  const missingKey = missingCovers.join(",");
  useEffect(() => {
    if (!missingKey) return;
    let cancelled = false;
    (async () => {
      const { renderPdfCover } = await import("@/lib/library/cover");
      for (const id of missingKey.split(",")) {
        if (cancelled) return;
        const file = await getBookFile(id);
        if (!file) continue;
        let cover = "";
        try {
          cover = await renderPdfCover(file);
        } catch {
          // damaged or unusual PDF: keep the generated cover
        }
        await setCover(id, cover);
        if (cancelled) return;
        setBooks((prev) => prev?.map((b) => (b.id === id ? { ...b, cover } : b)) ?? prev);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [missingKey]);

  async function handleFiles(files: FileList | File[]) {
    setError(null);
    setAdding(true);
    try {
      for (const file of Array.from(files)) await addBook(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add that file.");
    } finally {
      setAdding(false);
      await refresh();
    }
  }

  async function handleDelete(book: BookWithProgress) {
    if (!confirm(`Delete "${book.title}"? This removes the file and your reading progress.`)) return;
    await deleteBook(book.id);
    await refresh();
  }

  const openPicker = () => inputRef.current?.click();

  return (
    <div
      className="relative"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void handleFiles(e.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) void handleFiles(e.target.files);
          e.target.value = ""; // allow picking the same file again
        }}
      />

      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-medium tracking-tight sm:text-4xl">Your library</h1>
          <p className="mt-1.5 text-muted">
            {books && books.length > 0
              ? `${books.length} ${books.length === 1 ? "book" : "books"} · pick up where you left off`
              : "Pick up right where you left off."}
          </p>
        </div>
        {books && books.length > 0 && (
          <button
            type="button"
            onClick={openPicker}
            disabled={adding}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-ink px-4 text-sm font-medium text-bg shadow-card transition hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
          >
            {adding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Add PDF
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="mb-6 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      {books === null ? (
        <GridSkeleton />
      ) : books.length === 0 ? (
        <button
          type="button"
          onClick={openPicker}
          disabled={adding}
          className="flex w-full flex-col items-center rounded-3xl border border-dashed border-border bg-surface/60 px-6 py-20 text-center transition hover:border-accent/50 hover:bg-surface"
        >
          <span className="grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent">
            {adding ? <Loader2 className="size-6 animate-spin" /> : <FileUp className="size-6" strokeWidth={1.8} />}
          </span>
          <span className="mt-5 font-serif text-xl">Add your first book</span>
          <span className="mt-1.5 max-w-sm text-sm text-muted">
            Drop a PDF here or click to browse. Up to 50 MB per file.
          </span>
        </button>
      ) : (
        <div className="grid grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {books.map((book) => (
            <BookCard key={book.id} book={book} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-40 grid place-items-center bg-bg/70 backdrop-blur-sm">
          <div className="rounded-3xl border-2 border-dashed border-accent bg-surface px-10 py-8 text-center shadow-card">
            <FileUp className="mx-auto size-8 text-accent" />
            <p className="mt-3 font-serif text-xl">Drop to add to your library</p>
          </div>
        </div>
      )}
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i}>
          <div className="aspect-[2/3] animate-pulse rounded-md bg-surface-2" />
          <div className="mt-3 h-3.5 w-3/4 animate-pulse rounded bg-surface-2" />
          <div className="mt-2 h-1 animate-pulse rounded bg-surface-2" />
        </div>
      ))}
    </div>
  );
}
