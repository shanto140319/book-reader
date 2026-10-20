"use client";

import { ArrowLeft, PanelLeft } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

export const isDesktop = () => window.matchMedia("(min-width: 1024px)").matches;

/**
 * The side panel's open state. Phones always start with it closed so the book gets the whole
 * screen. `listsMounted` stays true 300ms after closing so the closing slide still shows the
 * lists; heavy lists (thumbnails, contents) only exist while it's true.
 */
export function useReaderSidebar(openOnDesktop: boolean) {
  const [open, setOpenState] = useState(() => openOnDesktop && isDesktop());
  const [listsMounted, setListsMounted] = useState(open);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const setOpen = useCallback((next: boolean) => {
    setOpenState(next);
    clearTimeout(closeTimer.current);
    if (next) setListsMounted(true);
    else closeTimer.current = setTimeout(() => setListsMounted(false), 300);
  }, []);
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  return { open, listsMounted, setOpen };
}

type Props = {
  title: string;
  /** 0–100, drawn as a thin bar under the header. */
  percent: number;
  /** Small button at the right of the header (page number, chapter…); it opens the panel. */
  pill?: React.ReactNode;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onCloseSidebar: () => void;
  sidebar: React.ReactNode;
  /** Short message shown at the bottom (e.g. a highlight that couldn't be saved). */
  notice: string | null;
  children: React.ReactNode;
};

/** Reader layout shared by PDF and EPUB: header, side panel (a drawer on phones), the book, notices. */
export function ReaderShell(props: Props) {
  const { title, percent, pill, sidebarOpen, onToggleSidebar, onCloseSidebar, sidebar, notice, children } = props;

  return (
    <div className="flex h-dvh flex-col bg-surface-2">
      <header className="relative z-20 flex h-14 shrink-0 items-center gap-1 border-b border-border bg-surface/85 px-2 backdrop-blur-xl sm:gap-2 sm:px-3">
        <Link
          href="/library"
          aria-label="Back to library"
          className="grid size-9 place-items-center rounded-full text-muted transition hover:bg-surface-2 hover:text-ink"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label={sidebarOpen ? "Hide panel" : "Show panel"}
          aria-expanded={sidebarOpen}
          className={`grid size-9 place-items-center rounded-full transition hover:bg-surface-2 hover:text-ink ${
            sidebarOpen ? "text-ink" : "text-muted"
          }`}
        >
          <PanelLeft className="size-5" />
        </button>
        <h1 className="ml-1 min-w-0 flex-1 truncate font-serif text-[17px]">{title}</h1>
        {pill}
        <div className="absolute inset-x-0 bottom-0 h-0.5">
          <div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${percent}%` }} />
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* Phone: the panel is a drawer over the page, with a dimmed backdrop. */}
        {sidebarOpen && (
          <div
            aria-hidden
            onClick={onCloseSidebar}
            className="fixed inset-0 z-30 bg-black/40 backdrop-blur-[2px] lg:hidden"
          />
        )}
        <aside
          aria-label="Reader controls"
          className={`fixed inset-y-0 left-0 z-40 w-80 max-w-[88vw] shrink-0 border-r border-border bg-surface shadow-2xl transition-transform duration-300 ease-out lg:static lg:z-auto lg:shadow-none lg:transition-none ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full lg:hidden"
          }`}
        >
          {sidebar}
        </aside>

        <div className="min-h-0 min-w-0 flex-1">{children}</div>
      </div>

      {notice && (
        <div
          role="status"
          className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 mx-auto w-fit max-w-sm rounded-2xl bg-ink px-4 py-2.5 text-center text-sm text-bg shadow-lg"
        >
          {notice}
        </div>
      )}
    </div>
  );
}

/** The header pill's look; give it the text and what tapping it does. */
export function HeaderPill({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="max-w-[45%] shrink-0 truncate rounded-full bg-surface-2 px-3 py-1 text-xs tabular-nums text-muted transition hover:text-ink"
    >
      {children}
    </button>
  );
}
