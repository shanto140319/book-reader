// Where PDF.js finds the extra files it downloads at runtime (copied into public/pdfjs by
// scripts/copy-pdfjs-assets.mjs). Without them, scanned books whose page images use JBIG2 or
// JPEG2000 render as blank white pages, and some Bangla/CJK text and unembedded fonts go missing.
// A module-level constant, so <Document options> keeps the same object and never reloads the file.
export const PDF_OPTIONS = {
  wasmUrl: "/pdfjs/wasm/",
  cMapUrl: "/pdfjs/cmaps/",
  cMapPacked: true,
  standardFontDataUrl: "/pdfjs/standard_fonts/",
};
