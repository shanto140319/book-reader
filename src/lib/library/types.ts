export type BookFileType = "pdf" | "epub";

export type Book = {
  id: string;
  title: string;
  author: string | null;
  fileType: BookFileType;
  sizeBytes: number;
  pageCount: number | null; // PDF only, filled in the first time the book is opened (EPUBs reflow: no fixed pages)
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

export const HIGHLIGHT_COLORS = ["yellow", "green", "blue", "pink", "purple"] as const;
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number];

/** One box of a highlight, as fractions (0–1) of the full, untrimmed page, so it fits any zoom or trim. */
export type HighlightRect = { page: number; x: number; y: number; w: number; h: number };

export type Highlight = {
  id: string;
  bookId: string;
  /** PDF: first page the highlight is on (a selection can cross into the next page). EPUB: chapter file, 1-based. */
  page: number;
  rects: HighlightRect[]; // PDF only; empty for EPUB
  cfi?: string; // EPUB only: where the highlighted words are in the book's text (a CFI range)
  text: string; // the highlighted words, for the sidebar list
  color: HighlightColor;
  createdAt: number;
  updatedAt: number;
};

/** Steps of adding a book, reported to the library page for its progress bar. */
export type UploadStep =
  | { stage: "checking" }
  | { stage: "cover" }
  | { stage: "uploading"; sent: number; total: number }
  | { stage: "saving" };
export type OnUploadStep = (step: UploadStep) => void;
