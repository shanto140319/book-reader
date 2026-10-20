"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BookCover } from "@/components/library/BookCover";

/** Cover, title, a line of detail and the progress bar at the top of the reader's side panel. */
export function SidebarHeader({
  title,
  label,
  cover,
  detail,
  percent,
  onClose,
}: {
  title: string;
  label: string;
  cover: string | null;
  detail: string;
  percent: number;
  onClose: () => void;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-border p-4">
      <div className="w-11 shrink-0">
        <BookCover title={title} label={label} image={cover} mini />
      </div>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 font-serif text-[15px] leading-snug">{title}</p>
        <p className="mt-1 truncate text-xs text-muted">{detail}</p>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close panel"
        className="-mr-1 -mt-1 grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-ink lg:hidden"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

export function SidebarTabs<T extends string>({
  tabs,
  tab,
  onTab,
}: {
  tabs: { value: T; label: string }[];
  tab: T;
  onTab: (tab: T) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Sidebar"
      className="mx-4 mt-3 grid gap-1 rounded-xl bg-surface-2 p-1"
      style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
    >
      {tabs.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          role="tab"
          aria-selected={tab === value}
          onClick={() => onTab(value)}
          className={`rounded-lg py-1.5 text-xs font-medium transition ${
            tab === value ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** A row of choices where one is picked (page fit, typeface…). */
export function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
  className = "",
}: {
  label: string;
  options: { value: T; label: React.ReactNode; title?: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`grid gap-1 rounded-xl bg-surface-2 p-1 ${className}`}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          title={option.title}
          onClick={() => onChange(option.value)}
          className={`rounded-lg py-1.5 text-xs font-medium transition ${
            value === option.value ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function ListSkeleton() {
  return (
    <div className="space-y-3 p-4" aria-busy>
      {[75, 60, 85, 70].map((w, i) => (
        <div key={i} className="h-3 animate-pulse rounded-full bg-surface-2" style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-subtle">{title}</h2>
      {children}
    </section>
  );
}

export function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="grid size-10 shrink-0 place-items-center rounded-xl border border-border bg-surface text-ink transition hover:bg-surface-2 active:scale-95 disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-surface-2 px-1 py-px font-sans text-[10px] text-muted">
      {children}
    </kbd>
  );
}

/**
 * A labelled slider. The thumb and value move instantly; `onChange` runs 150ms after the last
 * movement, since every change re-lays out the book. `onReset` shows a "Reset" link (for
 * settings whose default is "the book's own", which isn't a point on the slider).
 */
export function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
  onReset,
  ends,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
  onReset?: () => void;
  ends?: [string, string];
}) {
  const [draft, setDraft] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  function move(next: number) {
    setDraft(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      onChange(next);
      setDraft(null);
    }, 150);
  }
  const shown = draft ?? value;

  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="text-muted">{label}</span>
        <span className="flex items-center gap-2">
          {onReset && (
            <button type="button" onClick={onReset} className="text-xs text-subtle transition hover:text-accent">
              Reset
            </button>
          )}
          <span className="min-w-12 text-right font-medium tabular-nums">{format(shown)}</span>
        </span>
      </div>
      <input
        type="range"
        aria-label={label}
        aria-valuetext={format(shown)}
        min={min}
        max={max}
        step={step}
        value={Math.min(max, Math.max(min, shown))}
        onChange={(e) => move(Number(e.target.value))}
        className="mt-2.5 w-full cursor-pointer accent-accent"
      />
      {ends && (
        <div className="mt-0.5 flex justify-between text-[11px] text-subtle">
          <span>{ends[0]}</span>
          <span>{ends[1]}</span>
        </div>
      )}
    </div>
  );
}
