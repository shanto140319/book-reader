// Reader preferences. Saved in this browser (instant on open) and, when signed in, in the
// user_settings table so they follow you across devices. The newer copy wins.

import { createClient } from "@/lib/supabase/client";
import { supabaseConfigured } from "@/lib/supabase/config";

/**
 * auto:   comfortable width (fills small screens, capped on large ones)
 * width:  page fills the available width
 * page:   whole page fits on screen
 * custom: fixed zoom level (pdfZoom), set with the +/- buttons
 */
export type PdfFit = "auto" | "width" | "page" | "custom";

export type SidebarTab = "contents" | "pages" | "highlights" | "settings";

export type ReaderPrefs = {
  pdfFit: PdfFit;
  pdfZoom: number; // 1 = 100% = page fits this screen ("Auto" width); only used when pdfFit is "custom"
  sidebarOpen: boolean; // desktop only; on phones the sidebar always starts closed
  sidebarTab: SidebarTab;
};

const KEY = "pata:reader-prefs";
const DEFAULTS: ReaderPrefs = { pdfFit: "auto", pdfZoom: 1, sidebarOpen: true, sidebarTab: "contents" };
/** Wait this long after the last change before saving to the server (zoom clicks come in bursts). */
const REMOTE_DELAY = 1500;

type Saved = { prefs: Partial<ReaderPrefs>; updatedAt: number };

function readLocal(): Saved {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as Saved | null;
    return saved?.prefs ? saved : { prefs: {}, updatedAt: 0 };
  } catch {
    return { prefs: {}, updatedAt: 0 };
  }
}

/** This browser's copy, or the server's when that one is newer (changed on another device). */
export async function loadPrefs(): Promise<ReaderPrefs> {
  const local = readLocal();
  if (!supabaseConfigured) return { ...DEFAULTS, ...local.prefs };
  try {
    const { data } = await createClient().from("user_settings").select("reader_prefs, updated_at").maybeSingle();
    const remoteAt = data ? Date.parse(data.updated_at as string) : 0;
    if (data && remoteAt > local.updatedAt) {
      return { ...DEFAULTS, ...(data.reader_prefs as Partial<ReaderPrefs>) };
    }
  } catch {
    // offline: this browser's copy is fine
  }
  return { ...DEFAULTS, ...local.prefs };
}

let remoteTimer: ReturnType<typeof setTimeout> | undefined;

export function savePrefs(prefs: ReaderPrefs) {
  const updatedAt = Date.now();
  try {
    localStorage.setItem(KEY, JSON.stringify({ prefs, updatedAt } satisfies Saved));
  } catch {
    // Private mode or storage full: preferences just won't persist here.
  }
  if (!supabaseConfigured) return;
  clearTimeout(remoteTimer);
  remoteTimer = setTimeout(async () => {
    const { error } = await createClient()
      .from("user_settings")
      .upsert({ reader_prefs: prefs, updated_at: new Date(updatedAt).toISOString() }, { onConflict: "user_id" });
    if (error) console.error(error);
  }, REMOTE_DELAY);
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
