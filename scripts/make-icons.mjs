// Builds the raster icons from src/app/icon.svg (the source of truth for the logo mark):
// - src/app/favicon.ico   16/32/48 px, for browsers and tools that don't use the SVG
// - src/app/apple-icon.png 180 px, for iPhone/iPad home screens (no rounded corners: iOS adds them)
// Run after changing icon.svg:  node scripts/make-icons.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const appDir = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "app");
const svg = readFileSync(join(appDir, "icon.svg"), "utf8");

const png = (source, size) => sharp(Buffer.from(source), { density: 400 }).resize(size, size).png().toBuffer();

// Apple icon: square background (iOS rounds the corners itself).
await sharp(await png(svg.replace('rx="14"', 'rx="0"'), 180)).toFile(join(appDir, "apple-icon.png"));

// ICO = small header + directory + PNG images (PNG-in-ICO is supported everywhere that matters).
const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map((s) => png(svg, s)));
const header = Buffer.alloc(6);
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(images.length, 4);
let offset = 6 + 16 * images.length;
const entries = images.map((img, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(sizes[i], 0);
  e.writeUInt8(sizes[i], 1);
  e.writeUInt16LE(1, 4); // colour planes
  e.writeUInt16LE(32, 6); // bits per pixel
  e.writeUInt32LE(img.length, 8);
  e.writeUInt32LE(offset, 12);
  offset += img.length;
  return e;
});
writeFileSync(join(appDir, "favicon.ico"), Buffer.concat([header, ...entries, ...images]));
console.log("Wrote favicon.ico and apple-icon.png");
