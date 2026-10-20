"use client";

import { Highlighter, Trash2 } from "lucide-react";
import { useMemo } from "react";
import type { Highlight } from "@/lib/library/types";
import { compareHighlights, HIGHLIGHT_FILL, HIGHLIGHT_LABEL } from "@/lib/reader/highlights";

type Props = {
  highlights: Highlight[] | null; // null while loading
  onSelect: (highlight: Highlight) => void;
  onRemove: (id: string) => void;
};

/** Every highlight in the book, in reading order. Tap one to jump to it. */
export function PdfHighlights({ highlights, onSelect, onRemove }: Props) {
  const sorted = useMemo(() => (highlights ? [...highlights].sort(compareHighlights) : []), [highlights]);

  if (!highlights) {
    return (
      <div className="space-y-3 p-4" aria-busy>
        {[80, 65, 90].map((w, i) => (
          <div key={i} className="h-3 animate-pulse rounded-full bg-surface-2" style={{ width: `${w}%` }} />
        ))}
      </div>
    );
  }

  if (!sorted.length) {
    return (
      <div className="flex flex-col items-center px-6 py-12 text-center">
        <span className="grid size-11 place-items-center rounded-2xl bg-accent-soft text-accent">
          <Highlighter className="size-5" strokeWidth={1.8} />
        </span>
        <p className="mt-4 text-sm font-medium">No highlights yet</p>
        <p className="mt-1 text-xs leading-relaxed text-muted">Select text on a page, then pick a colour.</p>
      </div>
    );
  }

  return (
    <ul className="space-y-1 p-2">
      {sorted.map((h) => (
        <li key={h.id} className="group relative">
          <button
            type="button"
            onClick={() => onSelect(h)}
            className="flex w-full gap-3 rounded-xl px-2.5 py-2.5 pr-9 text-left transition hover:bg-surface-2"
          >
            <span
              aria-label={HIGHLIGHT_LABEL[h.color]}
              className="w-1 shrink-0 self-stretch rounded-full"
              style={{ background: HIGHLIGHT_FILL[h.color] }}
            />
            <span className="min-w-0 flex-1">
              <span className="line-clamp-4 font-serif text-[13.5px] leading-snug text-ink">{h.text}</span>
              <span className="mt-1 block text-[11px] tabular-nums text-subtle">Page {h.page}</span>
            </span>
          </button>
          <button
            type="button"
            aria-label="Remove highlight"
            title="Remove highlight"
            onClick={() => onRemove(h.id)}
            className="absolute right-1.5 top-2 grid size-7 place-items-center rounded-full text-subtle transition hover:bg-surface hover:text-danger focus-visible:opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
          >
            <Trash2 className="size-3.5" />
          </button>
        </li>
      ))}
    </ul>
  );
}
