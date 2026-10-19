// Renders page 1 of a PDF into a small cover image (WebP data URL).
// Imported dynamically from the library page so PDF.js only loads when a cover is needed.

import { pdfjs } from "react-pdf";

// Same worker setting as the reader (harmless to set twice; the value is identical).
pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

/** Cover width in pixels: sharp on high-DPI grids (cards are ~200px wide) and only ~20–40 KB. */
const COVER_WIDTH = 360;

export async function renderPdfCover(file: Blob): Promise<string> {
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  try {
    const pdf = await task.promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: COVER_WIDTH / page.getViewport({ scale: 1 }).width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    // PDFs are transparent where nothing is drawn; paint white first so covers aren't black.
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, viewport }).promise;
    return canvas.toDataURL("image/webp", 0.82);
  } finally {
    await task.destroy(); // frees the worker's copy of the file
  }
}
