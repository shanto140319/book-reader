"use client";

import { useCallback, useEffect, useState } from "react";
import { library } from "@/lib/library";
import type { Highlight, HighlightColor } from "@/lib/library/types";
import type { HighlightDraft } from "@/lib/reader/highlights";

/**
 * A book's highlights. Changes show at once and are saved in the background; if a save fails
 * it's undone on screen too, with a short message (`notice`), so what you see is what's stored.
 */
export function useHighlights(bookId: string) {
  const [highlights, setHighlights] = useState<Highlight[] | null>(null); // null = loading
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    library.listHighlights(bookId).then(
      (loaded) => {
        if (cancelled) return;
        // Keep any highlight made while the list was still loading.
        setHighlights((prev) => [...loaded, ...(prev ?? []).filter((p) => !loaded.some((l) => l.id === p.id))]);
      },
      (error: Error) => {
        if (cancelled) return;
        setHighlights((prev) => prev ?? []);
        setNotice(error.message);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  const addHighlight = useCallback(
    (draft: HighlightDraft, color: HighlightColor) => {
      const now = Date.now();
      const h: Highlight = { id: crypto.randomUUID(), bookId, ...draft, color, createdAt: now, updatedAt: now };
      setHighlights((list) => [...(list ?? []), h]);
      library.addHighlight(h).catch((error: Error) => {
        setHighlights((list) => list?.filter((x) => x.id !== h.id) ?? null);
        setNotice(error.message);
      });
    },
    [bookId],
  );

  const recolorHighlight = useCallback(
    (id: string, color: HighlightColor) => {
      const before = highlights?.find((h) => h.id === id);
      if (!before) return;
      const set = (c: HighlightColor) => setHighlights((list) => list?.map((h) => (h.id === id ? { ...h, color: c } : h)) ?? null);
      set(color);
      library.updateHighlight(id, { color }).catch((error: Error) => {
        set(before.color);
        setNotice(error.message);
      });
    },
    [highlights],
  );

  const removeHighlight = useCallback(
    (id: string) => {
      const removed = highlights?.find((h) => h.id === id);
      if (!removed) return;
      setHighlights((list) => list?.filter((h) => h.id !== id) ?? null);
      library.deleteHighlight(id).catch((error: Error) => {
        setHighlights((list) => [...(list ?? []), removed]);
        setNotice(error.message);
      });
    },
    [highlights],
  );

  return { highlights, notice, addHighlight, recolorHighlight, removeHighlight };
}
