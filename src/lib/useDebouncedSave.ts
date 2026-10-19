"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Returns `schedule(value)`. The latest value is saved `delay` ms after the
 * last call, and immediately when the tab is hidden, the page is closed, or
 * the component unmounts, so the final position is never lost.
 */
export function useDebouncedSave<T>(save: (value: T) => void | Promise<void>, delay = 2000) {
  const saveRef = useRef(save);
  const pending = useRef<{ value: T } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!pending.current) return;
    const { value } = pending.current;
    pending.current = null;
    void saveRef.current(value);
  }, []);

  const schedule = useCallback(
    (value: T) => {
      pending.current = { value };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, delay);
    },
    [delay, flush],
  );

  useEffect(() => {
    const onVisibility = () => document.visibilityState === "hidden" && flush();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      flush(); // leaving the reader inside the app (e.g. "Back to library")
    };
  }, [flush]);

  return schedule;
}
