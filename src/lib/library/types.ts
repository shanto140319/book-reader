export type BookFileType = "pdf" | "epub";

export type Book = {
  id: string;
  title: string;
  author: string | null;
  fileType: BookFileType;
  sizeBytes: number;
  pageCount: number | null; // PDF only, filled in the first time the book is opened
  pdfTrim?: number; // PDF only: fraction of page width hidden on EACH side (0–0.25). Per book, margins differ.
  createdAt: number;
};

export type Progress = {
  position: string; // PDF: page number as text. EPUB: CFI string.
  percent: number; // 0–100
  updatedAt: number; // ms timestamp; the newest save wins
};

export type BookWithProgress = Book & {
  progress: Progress | null;
  /** Cover image data URL. undefined = not made yet, "" = couldn't be made (use the generated cover). */
  cover?: string;
};

export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 1024 * 1024 * 1024;
