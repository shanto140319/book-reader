// Checks a picked file before it's added to the library, by its real header, not just its name.

import { MAX_FILE_BYTES, type BookFileType } from "./types";

export const CONTENT_TYPE: Record<BookFileType, string> = {
  pdf: "application/pdf",
  epub: "application/epub+zip",
};

/** The book's format. Throws an Error with a user-friendly message when it can't be added. */
export async function checkBookFile(file: File): Promise<BookFileType> {
  const isPdf = file.type === CONTENT_TYPE.pdf || /\.pdf$/i.test(file.name);
  const isEpub = file.type === CONTENT_TYPE.epub || /\.epub$/i.test(file.name);
  if (!isPdf && !isEpub) throw new Error("Only PDF and EPUB files are supported.");
  if (file.size > MAX_FILE_BYTES) throw new Error("That file is over the 50 MB limit.");

  // PDFs start with "%PDF-". EPUBs are zip files, which start with "PK\x03\x04".
  const header = new TextDecoder().decode(await file.slice(0, 5).arrayBuffer());
  if (isPdf) {
    if (header !== "%PDF-") throw new Error("That file doesn't look like a valid PDF.");
    return "pdf";
  }
  if (!header.startsWith("PK\x03\x04")) throw new Error("That file doesn't look like a valid EPUB.");
  return "epub";
}

/** "my_great-book.pdf" → "my great book". */
export function titleFromFileName(name: string) {
  return name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim().slice(0, 300) || "Untitled";
}

/**
 * Title, author and cover for a new book. EPUBs carry their own title and author (and an
 * unreadable EPUB is refused here). PDFs get the file name, and page 1 as the cover.
 */
export async function readBookInfo(file: File, type: BookFileType) {
  if (type === "epub") {
    const { readEpubInfo } = await import("./epub");
    const info = await readEpubInfo(file);
    return { title: info.title ?? titleFromFileName(file.name), author: info.author, cover: info.cover };
  }
  const { makeCover } = await import("./cover");
  return { title: titleFromFileName(file.name), author: null, cover: await makeCover(file, "pdf") };
}
