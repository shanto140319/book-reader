"use client";

import { Loader2, Trash2 } from "lucide-react";
import Link from "next/link";
import type { BookWithProgress } from "@/lib/library/types";
import { BookCover } from "./BookCover";

type Props = {
  book: BookWithProgress;
  /** True while this book is being deleted: the card dims and can't be opened. */
  deleting?: boolean;
  onDelete: (book: BookWithProgress) => void;
};

export function BookCard({ book, deleting = false, onDelete }: Props) {
  const percent = Math.round(book.progress?.percent ?? 0);
  const page = book.progress ? Number(book.progress.position) : null;

  return (
    <div className={`group relative transition-opacity ${deleting ? "pointer-events-none" : ""}`} aria-busy={deleting}>
      <Link
        href={`/read/${book.id}`}
        tabIndex={deleting ? -1 : undefined}
        className="relative block rounded-md shadow-[0_18px_36px_-18px_rgb(0_0_0/0.45)] transition duration-300 group-hover:-translate-y-1 group-hover:shadow-[0_28px_48px_-20px_rgb(0_0_0/0.5)]"
      >
        <BookCover title={book.title} label={book.fileType.toUpperCase()} image={book.cover} />
        {deleting && (
          <div className="absolute inset-0 grid place-items-center rounded-md bg-black/55 backdrop-blur-[2px]">
            <span className="flex flex-col items-center gap-2 text-xs font-medium text-white">
              <Loader2 className="size-6 animate-spin" />
              Deleting…
            </span>
          </div>
        )}
      </Link>

      {!deleting && (
        <button
          type="button"
          onClick={() => onDelete(book)}
          aria-label={`Delete ${book.title}`}
          title="Delete"
          className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-black/45 text-white opacity-0 backdrop-blur transition hover:bg-black/70 focus-visible:opacity-100 group-hover:opacity-100 max-sm:opacity-100"
        >
          <Trash2 className="size-4" />
        </button>
      )}

      <div className={`mt-3 space-y-2 ${deleting ? "opacity-50" : ""}`}>
        <Link
          href={`/read/${book.id}`}
          tabIndex={deleting ? -1 : undefined}
          className="line-clamp-2 text-sm font-medium leading-snug hover:text-accent"
        >
          {book.title}
        </Link>
        <div className="flex items-center gap-2">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${percent}%` }} />
          </div>
          <span className="text-[11px] tabular-nums text-muted">{percent}%</span>
        </div>
        <p className="text-xs text-subtle">
          {page && book.pageCount ? `Page ${page} of ${book.pageCount}` : page ? `Page ${page}` : "Not started"}
        </p>
      </div>
    </div>
  );
}
