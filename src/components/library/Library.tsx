"use client";

import { FileUp, Loader2, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { library } from "@/lib/library";
import type { BookWithProgress, UploadStep } from "@/lib/library/types";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { BookCard } from "./BookCard";

type Uploading = { name: string; index: number; count: number; step: UploadStep };

export function Library() {
  const [books, setBooks] = useState<BookWithProgress[] | null>(null);
  const [uploading, setUploading] = useState<Uploading | null>(null);
  const adding = uploading !== null;
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(
    () =>
      library.listBooks().then(setBooks, (e: Error) => {
        setBooks((prev) => prev ?? []);
        setError(e.message);
      }),
    [],
  );

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
        const file = await library.getBookFile(id);
        if (!file) continue;
        let cover = "";
        try {
          cover = await renderPdfCover(file);
        } catch {
          // damaged or unusual PDF: keep the generated cover
        }
        await library.setCover(id, cover);
        if (cancelled) return;
        setBooks((prev) => prev?.map((b) => (b.id === id ? { ...b, cover } : b)) ?? prev);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [missingKey]);

  // Ask before leaving mid-upload. (If you do leave, picking the same file again resumes it.)
  useEffect(() => {
    if (!adding) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [adding]);

  async function handleFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList);
    setError(null);
    const errors: string[] = [];
    // One at a time; a file that fails doesn't stop the rest.
    for (const [i, file] of files.entries()) {
      setUploading({ name: file.name, index: i + 1, count: files.length, step: { stage: "checking" } });
      try {
        await library.addBook(file, (step) => setUploading((u) => u && { ...u, step }));
        await refresh(); // show each book as soon as it's in
      } catch (e) {
        const message = e instanceof Error ? e.message : "Couldn't add that file.";
        errors.push(files.length > 1 ? `${file.name}: ${message}` : message);
      }
    }
    setUploading(null);
    if (errors.length) setError(errors.join("\n"));
  }

  // Books being deleted right now (several can be in flight at once).
  const [deleting, setDeleting] = useState<ReadonlySet<string>>(new Set());

  // The book waiting for "Delete" in the confirmation dialog.
  const [confirming, setConfirming] = useState<BookWithProgress | null>(null);

  async function handleDelete(book: BookWithProgress) {
    setConfirming(null);
    setDeleting((s) => new Set(s).add(book.id));
    try {
      await library.deleteBook(book.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete that book.");
    }
    await refresh();
    setDeleting((s) => {
      const next = new Set(s);
      next.delete(book.id);
      return next;
    });
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

      {uploading && <UploadProgress {...uploading} />}

      {error && (
        <p
          role="alert"
          className="mb-6 whitespace-pre-line rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger"
        >
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
            <BookCard key={book.id} book={book} deleting={deleting.has(book.id)} onDelete={setConfirming} />
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

      <ConfirmDialog
        open={confirming !== null}
        title="Delete this book?"
        confirmLabel="Delete"
        tone="danger"
        icon={<Trash2 className="size-5" />}
        onConfirm={() => confirming && void handleDelete(confirming)}
        onCancel={() => setConfirming(null)}
      >
        <p>
          <span className="font-medium text-ink">{confirming?.title}</span> will be removed from your library, along
          with your reading progress and highlights. This can&apos;t be undone.
        </p>
      </ConfirmDialog>
    </div>
  );
}

/**
 * Overall progress of the book being added. Sending the file is nearly all of the wait, so it
 * gets most of the bar; checking, making the cover and saving share the rest.
 */
function UploadProgress({ name, index, count, step }: Uploading) {
  let percent: number;
  let label: string;
  switch (step.stage) {
    case "checking":
      percent = 2;
      label = "Checking file…";
      break;
    case "cover":
      percent = 6;
      label = "Making cover…";
      break;
    case "uploading": {
      const share = step.total ? step.sent / step.total : 0;
      percent = 10 + share * 87;
      label = `Uploading · ${formatMB(step.sent)} of ${formatMB(step.total)}`;
      break;
    }
    case "saving":
      percent = 98;
      label = "Saving…";
      break;
  }
  const shown = Math.floor(percent);

  return (
    <div role="status" className="mb-6 rounded-2xl border border-border bg-surface px-4 py-3.5 shadow-card">
      <div className="flex items-center gap-3 text-sm">
        <Loader2 className="size-4 shrink-0 animate-spin text-accent" />
        <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
        <span className="shrink-0 font-medium tabular-nums">{shown}%</span>
      </div>
      <div
        role="progressbar"
        aria-label={`Adding ${name}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={shown}
        className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-surface-2"
      >
        <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-2 text-xs tabular-nums text-muted">
        {label}
        {count > 1 && ` · Book ${index} of ${count}`}
      </p>
    </div>
  );
}

const formatMB = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

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
