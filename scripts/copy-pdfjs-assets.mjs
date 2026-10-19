// Copies the files PDF.js downloads at runtime into public/pdfjs, so the browser can fetch them:
// - wasm: image decoders (JBIG2, JPEG2000) used by most scanned books, plus colour management
// - cmaps: character maps for CID fonts (common in Bangla and other non-Latin PDFs)
// - standard_fonts: fallbacks for PDFs that don't embed their fonts
// Runs automatically before `dev` and `build` and after `npm install`.

import { cpSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pdfjsDir = dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"));
const outDir = join(root, "public", "pdfjs");

rmSync(outDir, { recursive: true, force: true }); // drop files left over from an older pdfjs-dist
for (const folder of ["wasm", "cmaps", "standard_fonts"]) {
  cpSync(join(pdfjsDir, folder), join(outDir, folder), { recursive: true });
}
console.log(`Copied PDF.js assets to ${outDir}`);
