// Reader preferences, saved in this browser for now.
// Later these move to the user_settings table so they follow you across devices.

/**
 * auto:   comfortable width (fills small screens, capped on large ones)
 * width:  page fills the available width
 * page:   whole page fits on screen
 * custom: fixed zoom level (pdfZoom), set with the +/- buttons
 */
export type PdfFit = "auto" | "width" | "page" | "custom";

export type SidebarTab = "contents" | "pages" | "settings";

export type ReaderPrefs = {
  pdfFit: PdfFit;
  pdfZoom: number; // 1 = 100% = page fits this screen ("Auto" width); only used when pdfFit is "custom"
  sidebarOpen: boolean; // desktop only; on phones the sidebar always starts closed
  sidebarTab: SidebarTab;
};

const KEY = "folio:reader-prefs";
const DEFAULTS: ReaderPrefs = { pdfFit: "auto", pdfZoom: 1, sidebarOpen: true, sidebarTab: "contents" };

export function loadPrefs(): ReaderPrefs {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return DEFAULTS;
  }
}

export function savePrefs(prefs: ReaderPrefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Private mode or storage full: preferences just won't persist.
  }
}

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;
export const MAX_TRIM = 0.25;

const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];

export const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

/** The next zoom step above (dir 1) or below (dir -1) the current scale. */
export function nextZoom(scale: number, dir: 1 | -1) {
  if (dir > 0) return ZOOM_STEPS.find((s) => s > scale + 0.01) ?? ZOOM_STEPS.at(-1)!;
  return ZOOM_STEPS.findLast((s) => s < scale - 0.01) ?? ZOOM_STEPS[0];
}
