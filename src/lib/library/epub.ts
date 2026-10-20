// EPUB helpers on top of epub.js: opening a book file, and reading its title, author and cover.
// Imported dynamically, so epub.js only loads when an EPUB is added or opened.

import ePub, { type Book as EpubBook } from "epubjs";
import { COVER_WIDTH, encodeCover } from "./cover";

/**
 * Opens an EPUB file. Rejects when it isn't a readable EPUB. (`ePub(data)` would swallow that
 * error and never settle, so the book is opened with `open()` instead.)
 */
export async function openEpub(file: Blob): Promise<EpubBook> {
  const book = ePub();
  try {
    await book.open(await file.arrayBuffer(), "binary");
    // `opened` also waits for epub.js to finish rewriting the book's links to its files;
    // destroying the book before that throws inside epub.js.
    await Promise.all([book.ready, book.opened]);
    return book;
  } catch (error) {
    book.destroy();
    console.error(error);
    throw new Error("That file doesn't look like a valid EPUB.");
  }
}

export type EpubInfo = { title: string | null; author: string | null; cover: string };

/** Title and author from the book's metadata, and its cover picture as a small data URL ("" if none). */
export async function readEpubInfo(file: Blob): Promise<EpubInfo> {
  const book = await openEpub(file);
  try {
    const meta = await book.loaded.metadata;
    const url = await book.coverUrl().catch(() => null);
    return {
      title: clean(meta.title),
      author: clean(meta.creator),
      cover: url ? await drawCover(url).catch(() => "") : "",
    };
  } finally {
    book.destroy();
  }
}

const clean = (text: string | undefined) => text?.replace(/\s+/g, " ").trim().slice(0, 300) || null;

async function drawCover(url: string) {
  const img = new Image();
  img.src = url;
  await img.decode();
  if (!img.naturalWidth || !img.naturalHeight) return "";
  const canvas = document.createElement("canvas");
  canvas.width = COVER_WIDTH;
  // Very tall pictures are cut at 2:1; the library shows covers at 2:3 anyway.
  canvas.height = Math.round(Math.min(2, img.naturalHeight / img.naturalWidth) * COVER_WIDTH);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff"; // transparent PNG covers
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, (img.naturalHeight / img.naturalWidth) * canvas.width);
  return encodeCover(canvas);
}
