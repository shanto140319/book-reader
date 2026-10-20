// Small cover images for the library: page 1 of a PDF, or the cover picture of an EPUB.
// Each format's code is imported only when a cover of that kind is needed (PDF.js, epub.js).

import type { BookFileType } from "./types";

/** Cover width in pixels: sharp on high-DPI grids (cards are ~200px wide) and only ~20–40 KB. */
export const COVER_WIDTH = 360;

/** Cover image data URL, or "" when none could be made (the library shows a generated cover). */
export async function makeCover(file: Blob, type: BookFileType): Promise<string> {
  try {
    if (type === "epub") {
      const { readEpubInfo } = await import("./epub");
      return (await readEpubInfo(file)).cover;
    }
    const { renderPdfCover } = await import("./pdf-cover");
    return await renderPdfCover(file);
  } catch {
    return ""; // damaged or unusual file: keep the generated cover
  }
}

/** Same limit as the books.cover column in the database. */
const MAX_COVER_CHARS = 200_000;

/**
 * WebP where the browser can make it. Safari on iPhone can't, and silently returns a PNG
 * instead, which for a picture cover is several times over the limit, so the upload was
 * rejected. Then JPEG, lowering quality until it fits. "" (generated cover) if nothing fits.
 */
export function encodeCover(canvas: HTMLCanvasElement) {
  const webp = canvas.toDataURL("image/webp", 0.82);
  if (webp.startsWith("data:image/webp") && webp.length <= MAX_COVER_CHARS) return webp;
  for (const quality of [0.82, 0.7, 0.55, 0.4]) {
    const jpeg = canvas.toDataURL("image/jpeg", quality);
    if (jpeg.length <= MAX_COVER_CHARS) return jpeg;
  }
  return "";
}
