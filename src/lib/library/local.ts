// Browser-only book storage (IndexedDB via idb-keyval), used in local mode (no Supabase keys).
// With Supabase configured, ./cloud.ts is used instead (see ./index.ts).

import { createStore, del, entries, get, set, type UseStore } from "idb-keyval";
import { checkBookFile, readBookInfo } from "./detect";
import {
  MAX_TOTAL_BYTES,
  type Book,
  type BookWithProgress,
  type Highlight,
  type HighlightColor,
  type OnUploadStep,
  type Progress,
} from "./types";

// Separate stores so listing books never loads the (large) file blobs.
// Created lazily: IndexedDB doesn't exist during server rendering.
let stores: Record<"books" | "files" | "progress" | "covers" | "highlights", UseStore> | null = null;
function db() {
  stores ??= {
    books: createStore("folio-books", "books"),
    files: createStore("folio-files", "files"),
    progress: createStore("folio-progress", "progress"),
    covers: createStore("folio-covers", "covers"), // id → small WebP data URL ("" = couldn't render)
    highlights: createStore("folio-highlights", "highlights"), // highlight id → Highlight
  };
  return stores;
}

export async function listBooks(): Promise<BookWithProgress[]> {
  const [books, progress, covers] = await Promise.all([
    entries<string, Book>(db().books),
    entries<string, Progress>(db().progress),
    entries<string, string>(db().covers),
  ]);
  const progressById = new Map(progress);
  const coverById = new Map(covers);

  return books
    .map(([, book]) => ({ ...book, progress: progressById.get(book.id) ?? null, cover: coverById.get(book.id) }))
    // Most recently read first, then most recently added.
    .sort((a, b) => (b.progress?.updatedAt ?? b.createdAt) - (a.progress?.updatedAt ?? a.createdAt));
}

export async function getBook(id: string) {
  return get<Book>(id, db().books);
}

export async function getBookFile(book: Pick<Book, "id" | "fileType">) {
  return get<Blob>(book.id, db().files);
}

/** Validates and stores a picked file. Throws an Error with a user-friendly message. */
export async function addBook(file: File, onStep: OnUploadStep = () => {}): Promise<Book> {
  onStep({ stage: "checking" });
  const fileType = await checkBookFile(file);

  const used = (await entries<string, Book>(db().books)).reduce((sum, [, b]) => sum + b.sizeBytes, 0);
  if (used + file.size > MAX_TOTAL_BYTES) throw new Error("Your library is full (1 GB limit).");

  onStep({ stage: "cover" });
  const { title, author, cover } = await readBookInfo(file, fileType);

  const book: Book = {
    id: crypto.randomUUID(),
    title,
    author,
    fileType,
    sizeBytes: file.size,
    pageCount: null,
    createdAt: Date.now(),
  };
  // Store the file first so a book entry never points at a missing file.
  onStep({ stage: "saving" });
  await set(book.id, file, db().files);
  await set(book.id, cover, db().covers);
  await set(book.id, book, db().books);
  return book;
}

export async function updateBook(id: string, patch: Partial<Omit<Book, "id">>) {
  const book = await getBook(id);
  if (book) await set(id, { ...book, ...patch }, db().books);
}

export async function deleteBook(id: string) {
  const highlights = await listHighlights(id);
  await Promise.all([
    del(id, db().books),
    del(id, db().files),
    del(id, db().progress),
    del(id, db().covers),
    ...highlights.map((h) => del(h.id, db().highlights)),
    import("./epub-locations").then((cache) => cache.deleteSavedLocations(id)),
  ]);
}

/** Nothing to clear: in local mode this browser's storage IS the library. */
export async function clearCache() {}

export async function getCover(id: string) {
  return get<string>(id, db().covers);
}

/** Pass "" when the cover couldn't be rendered, so it isn't retried on every visit. */
export async function setCover(id: string, dataUrl: string) {
  await set(id, dataUrl, db().covers);
}

export async function getProgress(id: string) {
  return get<Progress>(id, db().progress);
}

/** Latest wins: an older save (by updatedAt) never overwrites a newer one. */
export async function saveProgress(id: string, progress: Progress) {
  const current = await getProgress(id);
  if (current && current.updatedAt > progress.updatedAt) return;
  await set(id, progress, db().progress);
}

export async function listHighlights(bookId: string): Promise<Highlight[]> {
  const all = await entries<string, Highlight>(db().highlights);
  return all.map(([, h]) => h).filter((h) => h.bookId === bookId);
}

export async function addHighlight(highlight: Highlight) {
  await set(highlight.id, highlight, db().highlights);
}

export async function updateHighlight(id: string, patch: { color: HighlightColor }) {
  const current = await get<Highlight>(id, db().highlights);
  if (current) await set(id, { ...current, ...patch, updatedAt: Date.now() }, db().highlights);
}

export async function deleteHighlight(id: string) {
  await del(id, db().highlights);
}
