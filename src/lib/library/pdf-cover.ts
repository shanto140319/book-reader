// Renders page 1 of a PDF into a small cover image. Loaded through makeCover() in ./cover.ts,
// so PDF.js only loads when a cover is needed.

import { pdfjs } from "react-pdf";
import { PDF_OPTIONS } from "@/lib/reader/pdfjs";
import { COVER_WIDTH, encodeCover } from "./cover";

// Same worker setting as the reader (harmless to set twice; the value is identical).
pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

export async function renderPdfCover(file: Blob): Promise<string> {
  const task = pdfjs.getDocument({ ...PDF_OPTIONS, data: new Uint8Array(await file.arrayBuffer()) });
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
    return encodeCover(canvas);
  } finally {
    await task.destroy(); // frees the worker's copy of the file
  }
}
