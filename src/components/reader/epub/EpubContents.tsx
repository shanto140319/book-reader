"use client";

import { useEffect, useRef } from "react";
import type { TocItem } from "@/lib/reader/epub";

type Props = {
  toc: TocItem[];
  /** The contents entry being read now. */
  current: TocItem | null;
  onSelect: (href: string) => void;
};

/** The book's table of contents. The chapter being read is marked and kept in view. */
export function EpubContents({ toc, current, onSelect }: Props) {
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "center" });
  }, [current]);

  if (!toc.length) {
    return <p className="px-6 py-12 text-center text-sm text-muted">This book has no table of contents.</p>;
  }

  function renderItems(items: TocItem[], depth: number) {
    return (
      <ul className={depth ? "mb-1 ml-[14px] border-l border-border pl-1.5" : "space-y-0.5"}>
        {items.map((item) => {
          const active = item === current;
          return (
            <li key={item.id || item.href}>
              <button
                ref={active ? activeRef : undefined}
                type="button"
                aria-current={active ? "location" : undefined}
                onClick={() => onSelect(item.href)}
                className={`relative w-full rounded-lg px-2.5 py-1.5 text-left transition hover:bg-surface-2 ${
                  active ? "bg-accent-soft text-accent" : "text-ink"
                }`}
              >
                {active && <span aria-hidden className="absolute -left-[4px] inset-y-1.5 w-0.5 rounded-full bg-accent" />}
                <span className={`line-clamp-2 leading-snug ${depth ? "text-[13px]" : "text-[13.5px] font-medium"}`}>
                  {item.label.trim() || "Untitled"}
                </span>
              </button>
              {item.subitems?.length ? renderItems(item.subitems, depth + 1) : null}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="pb-6">
      {current && (
        <button
          type="button"
          onClick={() => onSelect(current.href)}
          className="mx-3 mb-3 mt-1 block w-[calc(100%-1.5rem)] rounded-2xl border border-border bg-bg/70 p-3.5 text-left transition hover:border-accent/40"
        >
          <span className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-accent">
            <span className="size-1.5 rounded-full bg-accent" />
            Now reading
          </span>
          <span className="mt-1.5 line-clamp-2 block text-[14px] font-semibold leading-snug tracking-[-0.005em]">
            {current.label.trim() || "Untitled"}
          </span>
        </button>
      )}
      <nav aria-label="Table of contents" className="px-2">
        {renderItems(toc, 0)}
      </nav>
    </div>
  );
}
