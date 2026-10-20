// Library stored in Supabase, used when Supabase is configured (see ./index.ts).
// Same functions as ./local.ts, so the UI doesn't care which one it talks to.
//
// - Book info, progress, highlights: Postgres tables (supabase/migrations), protected by Row Level Security.
// - Files: private Storage bucket "books", at <user id>/<book id>.pdf, uploaded resumably (./upload.ts).
// - This browser keeps a cache of downloaded files and covers in IndexedDB, so a book is
//   downloaded once per device and the library doesn't re-fetch every cover on each visit.

import { clear, createStore, del, entries, get, keys, set, type UseStore } from "idb-keyval";
import { createClient } from "@/lib/supabase/client";
import {
  MAX_FILE_BYTES,
  MAX_TOTAL_BYTES,
  type Book,
  type BookWithProgress,
  type Highlight,
  type HighlightColor,
  type OnUploadStep,
  type Progress,
} from "./types";
import { prepareUpload } from "./upload";

const BUCKET = "books";
const BOOK_COLUMNS = "id, title, author, file_type, size_bytes, page_count, pdf_trim, created_at";

type BookRow = {
  id: string;
  title: string;
  author: string | null;
  file_type: Book["fileType"];
  size_bytes: number;
  page_count: number | null;
  pdf_trim: number | null;
  created_at: string;
};
type ProgressRow = { book_id: string; position: string; percent: number; updated_at: string };
type HighlightRow = {
  id: string;
  book_id: string;
  page: number;
  rects: Highlight["rects"];
  text: string;
  color: HighlightColor;
  created_at: string;
  updated_at: string;
};
const HIGHLIGHT_COLUMNS = "id, book_id, page, rects, text, color, created_at, updated_at";

let stores: { files: UseStore; covers: UseStore } | null = null;
function cache() {
  stores ??= {
    files: createStore("pata-cache-files", "files"),
    covers: createStore("pata-cache-covers", "covers"),
  };
  return stores;
}

const sb = () => createClient();

async function userId() {
  const { data } = await sb().auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error("You're signed out. Please sign in again.");
  return id;
}

/** The current access token (refreshed by supabase-js when it's about to expire). */
async function accessToken() {
  const { data } = await sb().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("You're signed out. Please sign in again.");
  return token;
}

const filePath = (uid: string, bookId: string) => `${uid}/${bookId}.pdf`;

function toBook(row: BookRow): Book {
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    fileType: row.file_type,
    sizeBytes: row.size_bytes,
    pageCount: row.page_count,
    pdfTrim: row.pdf_trim ?? undefined,
    createdAt: Date.parse(row.created_at),
  };
}

function toProgress(row: ProgressRow): Progress {
  return { position: row.position, percent: row.percent, updatedAt: Date.parse(row.updated_at) };
}

function fail(error: { message: string } | null, message: string): asserts error is null {
  if (error) {
    console.error(error);
    throw new Error(message);
  }
}

export async function listBooks(): Promise<BookWithProgress[]> {
  const [books, progress] = await Promise.all([
    sb().from("books").select(BOOK_COLUMNS).overrideTypes<BookRow[], { merge: false }>(),
    sb().from("reading_progress").select("book_id, position, percent, updated_at").overrideTypes<ProgressRow[], { merge: false }>(),
  ]);
  fail(books.error, "Couldn't load your library. Check your connection and try again.");
  fail(progress.error, "Couldn't load your reading progress.");

  const ids = new Set(books.data.map((b) => b.id));
  await pruneCache(ids);

  // Covers: from this browser's cache, fetching only the ones it doesn't have yet.
  const coverById = new Map(await entries<string, string>(cache().covers));
  const missing = [...ids].filter((id) => !coverById.has(id));
  if (missing.length) {
    const { data } = await sb().from("books").select("id, cover").in("id", missing);
    for (const { id, cover } of data ?? []) {
      coverById.set(id, cover ?? "");
      await set(id, cover ?? "", cache().covers);
    }
  }

  const progressById = new Map(progress.data.map((p) => [p.book_id, toProgress(p)]));
  return books.data
    .map((row) => ({
      ...toBook(row),
      progress: progressById.get(row.id) ?? null,
      cover: coverById.get(row.id) ?? "",
    }))
    .sort((a, b) => (b.progress?.updatedAt ?? b.createdAt) - (a.progress?.updatedAt ?? a.createdAt));
}

/** Drops cached files/covers of books that are gone (deleted, or another account's on this browser). */
async function pruneCache(keep: Set<string>) {
  for (const store of [cache().files, cache().covers]) {
    for (const key of await keys<string>(store)) if (!keep.has(key)) await del(key, store);
  }
}

/** Forget every cached book in this browser (on sign out). */
export async function clearCache() {
  await Promise.all([clear(cache().files), clear(cache().covers)]);
}

export async function getBook(id: string) {
  const { data, error } = await sb().from("books").select(BOOK_COLUMNS).eq("id", id).maybeSingle().overrideTypes<BookRow, { merge: false }>();
  fail(error, "Couldn't load this book.");
  return data ? toBook(data) : undefined;
}

/** From this browser's cache, or downloaded once and cached. */
export async function getBookFile(id: string) {
  const cached = await get<Blob>(id, cache().files);
  if (cached) return cached;
  const { data, error } = await sb().storage.from(BUCKET).download(filePath(await userId(), id));
  if (error) {
    console.error(error);
    return undefined;
  }
  await set(id, data, cache().files).catch(() => {}); // storage full: still open it, just uncached
  return data;
}

/** Validates, uploads and stores a picked file. Throws an Error with a user-friendly message. */
export async function addBook(file: File, onStep: OnUploadStep = () => {}): Promise<Book> {
  onStep({ stage: "checking" });
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (!isPdf) throw new Error("Only PDF files are supported for now.");
  if (file.size > MAX_FILE_BYTES) throw new Error("That file is over the 50 MB limit.");

  // Check the real file header, not just the name: PDFs start with "%PDF-".
  const header = new TextDecoder().decode(await file.slice(0, 5).arrayBuffer());
  if (header !== "%PDF-") throw new Error("That file doesn't look like a valid PDF.");

  // Friendly early check; the database enforces the same limit (books_quota trigger).
  const sizes = await sb().from("books").select("size_bytes").overrideTypes<{ size_bytes: number }[], { merge: false }>();
  fail(sizes.error, "Couldn't check your storage. Check your connection and try again.");
  const used = sizes.data.reduce((sum, b) => sum + b.size_bytes, 0);
  if (used + file.size > MAX_TOTAL_BYTES) throw new Error("Your library is full (1 GB limit).");

  const uid = await userId();
  const upload = await prepareUpload(file, uid, accessToken);
  const id = upload.id;
  const path = filePath(uid, id);

  // Cover from page 1, made now while we have the file, so other devices never need to
  // download the whole book just to show its cover.
  onStep({ stage: "cover" });
  let cover = "";
  try {
    const { renderPdfCover } = await import("./cover");
    cover = await renderPdfCover(file);
  } catch {
    // damaged or unusual PDF: the library shows a generated cover instead
  }

  // Upload the file first so a book row never points at a missing file.
  onStep({ stage: "uploading", sent: 0, total: file.size });
  await upload.start((sent, total) => onStep({ stage: "uploading", sent, total }));

  onStep({ stage: "saving" });
  const { data, error } = await sb()
    .from("books")
    .insert({
      id,
      user_id: uid,
      title: file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim().slice(0, 300) || "Untitled",
      file_type: "pdf",
      size_bytes: file.size,
      cover: cover || null,
    })
    .select(BOOK_COLUMNS)
    .single()
    .overrideTypes<BookRow, { merge: false }>();
  if (error) {
    await sb().storage.from(BUCKET).remove([path]);
    console.error(error);
    throw new Error(error.message.includes("library_full") ? "Your library is full (1 GB limit)." : "Couldn't add that book.");
  }

  await Promise.all([set(id, file, cache().files).catch(() => {}), set(id, cover, cache().covers)]);
  return toBook(data);
}

/** Only title, author, pageCount and pdfTrim can change after upload. */
export async function updateBook(id: string, patch: Partial<Omit<Book, "id">>) {
  const row: Record<string, unknown> = {};
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.author !== undefined) row.author = patch.author;
  if (patch.pageCount !== undefined) row.page_count = patch.pageCount;
  if (patch.pdfTrim !== undefined) row.pdf_trim = patch.pdfTrim;
  const { error } = await sb().from("books").update(row).eq("id", id);
  if (error) console.error(error); // background save: the reader keeps working either way
}

export async function deleteBook(id: string) {
  const { error } = await sb().from("books").delete().eq("id", id); // progress and highlights go with it (cascade)
  fail(error, "Couldn't delete that book. Check your connection and try again.");
  await sb().storage.from(BUCKET).remove([filePath(await userId(), id)]);
  await Promise.all([del(id, cache().files), del(id, cache().covers)]);
}

export async function getCover(id: string) {
  const cached = await get<string>(id, cache().covers);
  if (cached !== undefined) return cached;
  const { data } = await sb().from("books").select("cover").eq("id", id).maybeSingle();
  const cover = (data?.cover as string | null) ?? "";
  await set(id, cover, cache().covers);
  return cover;
}

export async function setCover(id: string, dataUrl: string) {
  await set(id, dataUrl, cache().covers);
  await sb().from("books").update({ cover: dataUrl || null }).eq("id", id);
}

export async function getProgress(id: string) {
  const { data } = await sb()
    .from("reading_progress")
    .select("book_id, position, percent, updated_at")
    .eq("book_id", id)
    .maybeSingle()
    .overrideTypes<ProgressRow, { merge: false }>();
  return data ? toProgress(data) : undefined;
}

/** Latest wins (checked in the database): an older save never overwrites a newer one. */
export async function saveProgress(id: string, progress: Progress) {
  const { error } = await sb().rpc("save_progress", {
    p_book_id: id,
    p_position: progress.position,
    p_percent: progress.percent,
    p_updated_at: new Date(progress.updatedAt).toISOString(),
  });
  if (error) console.error(error);
}

function toHighlight(row: HighlightRow): Highlight {
  return {
    id: row.id,
    bookId: row.book_id,
    page: row.page,
    rects: row.rects,
    text: row.text,
    color: row.color,
    createdAt: Date.parse(row.created_at),
    updatedAt: Date.parse(row.updated_at),
  };
}

export async function listHighlights(bookId: string): Promise<Highlight[]> {
  const { data, error } = await sb()
    .from("highlights")
    .select(HIGHLIGHT_COLUMNS)
    .eq("book_id", bookId)
    .overrideTypes<HighlightRow[], { merge: false }>();
  fail(error, "Couldn't load your highlights.");
  return data.map(toHighlight);
}

/** Throws when it can't be saved, so the reader can take the highlight back off the page. */
export async function addHighlight(h: Highlight) {
  const { error } = await sb()
    .from("highlights")
    .insert({
      id: h.id,
      book_id: h.bookId,
      page: h.page,
      rects: h.rects,
      text: h.text,
      color: h.color,
      created_at: new Date(h.createdAt).toISOString(),
      updated_at: new Date(h.updatedAt).toISOString(),
    });
  fail(error, "Couldn't save that highlight. Check your connection and try again.");
}

export async function updateHighlight(id: string, patch: { color: HighlightColor }) {
  const { error } = await sb()
    .from("highlights")
    .update({ color: patch.color, updated_at: new Date().toISOString() })
    .eq("id", id);
  fail(error, "Couldn't change that highlight. Check your connection and try again.");
}

export async function deleteHighlight(id: string) {
  const { error } = await sb().from("highlights").delete().eq("id", id);
  fail(error, "Couldn't remove that highlight. Check your connection and try again.");
}
