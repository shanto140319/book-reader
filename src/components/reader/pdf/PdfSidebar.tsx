"use client";

import { ChevronDown, ChevronUp, Minus, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { Highlight } from "@/lib/library/types";
import { MAX_TRIM, MAX_ZOOM, MIN_ZOOM, type PdfFit, type SidebarTab } from "@/lib/reader/prefs";
import { HighlightsList } from "../shared/HighlightsList";
import { IconButton, Kbd, ListSkeleton, Section, Segmented, SidebarHeader, SidebarTabs } from "../shared/SidebarParts";
import { PdfOutline } from "./PdfOutline";
import { PdfThumbnails } from "./PdfThumbnails";

type Props = {
  /** false while the panel is closed: the Contents/Pages lists aren't rendered then. */
  active: boolean;
  pdf: PDFDocumentProxy | null;
  tab: SidebarTab;
  onTab: (tab: SidebarTab) => void;
  title: string;
  cover: string | null;
  page: number;
  numPages: number;
  scale: number;
  fit: PdfFit;
  trim: number;
  highlights: Highlight[] | null;
  onGoToHighlight: (highlight: Highlight) => void;
  onRemoveHighlight: (id: string) => void;
  onGoTo: (page: number) => void;
  onZoom: (dir: 1 | -1) => void;
  onZoomTo: (zoom: number) => void;
  onFit: (fit: PdfFit) => void;
  onTrim: (trim: number) => void;
  onClose: () => void;
};

const FITS: { value: PdfFit; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "width", label: "Fit width" },
  { value: "page", label: "Fit page" },
];

const TABS: { value: SidebarTab; label: string }[] = [
  { value: "contents", label: "Contents" },
  { value: "pages", label: "Pages" },
  { value: "highlights", label: "Highlights" },
  { value: "settings", label: "Settings" },
];

export function PdfSidebar(props: Props) {
  const { active, pdf, tab, onTab, title, cover, page, numPages, scale, fit, trim, highlights } = props;
  const { onGoTo, onZoom, onZoomTo, onFit, onTrim, onClose, onGoToHighlight, onRemoveHighlight } = props;
  const percent = numPages ? Math.round((page / numPages) * 100) : 0;

  // Slider moves instantly; the (expensive) page re-render is applied 150ms after it stops.
  const [trimDraft, setTrimDraft] = useState<number | null>(null);
  const trimTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => clearTimeout(trimTimer.current ?? undefined), []);
  function changeTrim(value: number) {
    setTrimDraft(value);
    clearTimeout(trimTimer.current ?? undefined);
    trimTimer.current = setTimeout(() => {
      onTrim(value);
      setTrimDraft(null);
    }, 150);
  }
  const trimShown = trimDraft ?? trim;

  return (
    <div className="flex h-full flex-col">
      <SidebarHeader
        title={title}
        label="PDF"
        cover={cover}
        detail={numPages ? `${numPages} pages · ${percent}% read` : "Loading…"}
        percent={percent}
        onClose={onClose}
      />

      <SidebarTabs tabs={TABS} tab={tab} onTab={onTab} />

      {/* data-sidebar-scroll: the scroll area the outline/thumbnail lists keep their current item visible in */}
      <div data-sidebar-scroll role="tabpanel" className="relative mt-2 min-h-0 flex-1 overflow-y-auto">
        {active &&
          tab === "contents" &&
          (pdf ? (
            <PdfOutline
              pdf={pdf}
              currentPage={page}
              numPages={numPages}
              onSelect={onGoTo}
              onShowPages={() => onTab("pages")}
            />
          ) : (
            <ListSkeleton />
          ))}
        {active &&
          tab === "pages" &&
          (pdf ? (
            <PdfThumbnails pdf={pdf} numPages={numPages} currentPage={page} onSelect={onGoTo} />
          ) : (
            <ListSkeleton />
          ))}
        {active && tab === "highlights" && (
          <HighlightsList
            highlights={highlights}
            locationLabel={(h) => `Page ${h.page}`}
            onSelect={onGoToHighlight}
            onRemove={onRemoveHighlight}
          />
        )}
        {tab === "settings" && (
          <div className="space-y-7 p-4 pt-3">
            <Section title="Page">
              <div className="flex items-center gap-2">
                <IconButton label="Previous page" onClick={() => onGoTo(page - 1)} disabled={page <= 1}>
                  <ChevronUp className="size-4" />
                </IconButton>
                <NumberField
                  label="Page number"
                  value={page}
                  suffix={`of ${numPages || "–"}`}
                  onCommit={(n) => onGoTo(Math.min(Math.max(1, n), numPages))}
                />
                <IconButton label="Next page" onClick={() => onGoTo(page + 1)} disabled={page >= numPages}>
                  <ChevronDown className="size-4" />
                </IconButton>
              </div>
            </Section>

            <Section title="Zoom">
              <div className="flex items-center gap-2">
                <IconButton label="Zoom out" onClick={() => onZoom(-1)} disabled={scale <= MIN_ZOOM + 0.005}>
                  <Minus className="size-4" />
                </IconButton>
                <NumberField
                  label="Zoom percent"
                  value={Math.round(scale * 100)}
                  suffix="%"
                  center
                  onCommit={(n) => onZoomTo(Math.min(MAX_ZOOM * 100, Math.max(MIN_ZOOM * 100, n)) / 100)}
                />
                <IconButton label="Zoom in" onClick={() => onZoom(1)} disabled={scale >= MAX_ZOOM - 0.005}>
                  <Plus className="size-4" />
                </IconButton>
              </div>
              <Segmented label="Page fit" options={FITS} value={fit} onChange={onFit} className="mt-3" />
              <p className="mt-2 text-[11px] leading-relaxed text-subtle">100% fits this screen (same as Auto).</p>
            </Section>

            <Section title="Margins">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted">Trim left &amp; right</span>
                <span className="font-medium tabular-nums">
                  {trimShown ? `${Math.round(trimShown * 100)}%` : "Off"}
                </span>
              </div>
              <input
                type="range"
                aria-label="Trim side margins"
                min={0}
                max={MAX_TRIM * 100}
                step={1}
                value={Math.round(trimShown * 100)}
                onChange={(e) => changeTrim(Number(e.target.value) / 100)}
                className="mt-3 w-full cursor-pointer accent-accent"
              />
              <div className="mt-1 flex justify-between text-[11px] text-subtle">
                <span>Original</span>
                <span>Bigger text</span>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-subtle">
                Hides the page&apos;s white side margins. Saved for this book.
              </p>
            </Section>
          </div>
        )}
      </div>

      <p
        className={`hidden border-t border-border px-4 py-3 text-[11px] leading-relaxed text-subtle ${
          tab === "settings" ? "lg:block" : ""
        }`}
      >
        <Kbd>Ctrl</Kbd> <Kbd>+</Kbd> / <Kbd>−</Kbd> zoom · <Kbd>Ctrl</Kbd> <Kbd>0</Kbd> reset
      </p>
    </div>
  );
}

/** Numeric input that follows `value` until you type; Enter or leaving the field applies it, Esc cancels. */
function NumberField({
  label,
  value,
  suffix,
  center = false,
  onCommit,
}: {
  label: string;
  value: number;
  suffix: string;
  center?: boolean;
  onCommit: (n: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  function commit() {
    const n = Number.parseInt(draft ?? "", 10);
    if (draft !== null && Number.isFinite(n)) onCommit(n);
    setDraft(null);
  }

  return (
    <label
      className={`flex h-10 min-w-0 flex-1 items-center gap-1 rounded-xl border border-border bg-bg px-3 transition focus-within:border-accent focus-within:ring-2 focus-within:ring-ring ${
        center ? "justify-center" : ""
      }`}
    >
      <input
        inputMode="numeric"
        aria-label={label}
        value={draft ?? String(value)}
        onChange={(e) => setDraft(e.target.value.replace(/\D/g, "").slice(0, 5))}
        onFocus={(e) => e.target.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur(); // blur → commit
          if (e.key === "Escape") {
            setDraft(null);
            // blur after the reset so commit() sees no draft
            requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
          }
        }}
        style={center ? { width: `${Math.max(2, (draft ?? String(value)).length) + 0.5}ch` } : undefined}
        className={`min-w-0 bg-transparent text-sm font-medium tabular-nums outline-none ${center ? "text-right" : "w-full"}`}
      />
      <span className="shrink-0 text-sm text-subtle">{suffix}</span>
    </label>
  );
}
