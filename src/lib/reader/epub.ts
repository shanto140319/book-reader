// EPUB reading helpers that don't need epub.js itself: page colours and fonts (as CSS put into
// each chapter), and which table-of-contents entry a chapter file belongs to.

import type { HighlightColor } from "@/lib/library/types";
import { HIGHLIGHT_FILL } from "./highlights";
import type { EpubFont, EpubTheme } from "./prefs";

export type EpubPageTheme = Exclude<EpubTheme, "auto">;

/** Page colours. Light and dark match the app's surface and ink colours. */
export const EPUB_THEMES: Record<EpubPageTheme, { bg: string; ink: string; link: string; label: string }> = {
  light: { bg: "#ffffff", ink: "#1b1916", link: "#a4532b", label: "Light" },
  sepia: { bg: "#f4ecd8", ink: "#5b4636", link: "#9a4a22", label: "Sepia" },
  dark: { bg: "#181614", ink: "#e6e1d8", link: "#e09a6c", label: "Dark" },
};

const FONT_STACKS: Record<Exclude<EpubFont, "publisher">, string> = {
  serif: `"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Noto Serif", serif`,
  sans: `system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif`,
};

export type EpubLook = {
  theme: EpubPageTheme;
  font: EpubFont;
  fontSize: number; // percent
  fontWeight: number; // 0 = the book's own
  letterSpacing: number; // em
  lineHeight: number; // 0 = the book's own
};

/**
 * CSS put into every chapter. The book's own styles stay, except what the reader chose:
 * colours (sepia/dark override the book's text colours, or dark text would vanish),
 * the typeface, text size and line spacing.
 */
export function epubCss({ theme, font, fontSize, fontWeight, letterSpacing, lineHeight }: EpubLook) {
  const t = EPUB_THEMES[theme];
  const rules = [
    // An opaque page: a see-through iframe turns white when its colour scheme differs from the app's.
    `html { background: ${t.bg} !important; color-scheme: ${theme === "dark" ? "dark" : "light"}; }`,
    `body { background: transparent !important; }`,
    // Sideways finger drags turn pages (see EpubView), so the browser mustn't take them as its own swipe.
    `html, body { touch-action: pan-y pinch-zoom; overscroll-behavior: none; }`,
    `::selection { background: rgb(164 83 43 / 0.28); }`,
  ];
  if (theme !== "light") {
    rules.push(
      `body { color: ${t.ink} !important; }`,
      `body *:not(img):not(svg):not(svg *) { color: inherit !important; background-color: transparent !important; }`,
      `body a, body a * { color: ${t.link} !important; }`,
    );
  }
  if (font !== "publisher") {
    rules.push(`body, body *:not(code):not(pre):not(kbd):not(samp) { font-family: ${FONT_STACKS[font]} !important; }`);
  }
  if (fontSize !== 100) rules.push(`body { font-size: ${fontSize}% !important; }`);
  if (fontWeight) {
    // Body text only: headings, <b> and <strong> stay bolder than it.
    rules.push(
      `body { font-weight: ${fontWeight} !important; }`,
      `body p, body li, body blockquote, body dd, body td { font-weight: inherit !important; }`,
    );
  }
  if (letterSpacing) rules.push(`body, body * { letter-spacing: ${letterSpacing}em !important; }`);
  if (lineHeight) rules.push(`body, body p, body li, body div, body span { line-height: ${lineHeight} !important; }`);
  return rules.join("\n");
}

/** SVG attributes for epub.js highlight marks. Multiply keeps text readable on light pages. */
export function highlightStyles(color: HighlightColor, theme: EpubPageTheme) {
  return theme === "dark"
    ? { fill: HIGHLIGHT_FILL[color], "fill-opacity": "0.35", "mix-blend-mode": "normal" }
    : { fill: HIGHLIGHT_FILL[color], "fill-opacity": "0.5", "mix-blend-mode": "multiply" };
}

export type TocItem = { id: string; href: string; label: string; subitems?: TocItem[] };

/** "Text/ch01.xhtml#sec2" → "Text/ch01.xhtml", decoded so "%20" and " " compare equal. */
function pathOf(href: string) {
  const path = href.split("#")[0];
  try {
    return decodeURI(path);
  } catch {
    return path;
  }
}

/**
 * For each chapter file of the book (spine order), the contents entry it belongs to: the last
 * entry that starts in it or before it. `spineHrefs` are the spine items' hrefs.
 * Contents links are relative to the contents file, which may sit in another folder than the
 * spine's paths are relative to, so a link also matches a spine path that ends with it.
 */
export function chaptersBySpine(toc: TocItem[], spineHrefs: string[]): (TocItem | null)[] {
  const paths = spineHrefs.map(pathOf);
  const indexOf = (href: string) => {
    const path = pathOf(href).replace(/^(\.\.\/|\.\/)+/, "");
    const exact = paths.indexOf(path);
    return exact >= 0 ? exact : paths.findIndex((p) => p.endsWith(`/${path}`));
  };

  const starts: (TocItem | null)[] = paths.map(() => null);
  const walk = (items: TocItem[]) => {
    for (const item of items) {
      const i = indexOf(item.href);
      if (i >= 0 && !starts[i]) starts[i] = item; // first (outermost) entry pointing into this file
      if (item.subitems?.length) walk(item.subitems);
    }
  };
  walk(toc);

  let current: TocItem | null = null;
  return starts.map((item) => (current = item ?? current));
}
