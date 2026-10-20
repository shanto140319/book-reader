"use client";

import { Check } from "lucide-react";
import type { Highlight } from "@/lib/library/types";
import { EPUB_THEMES, type EpubPageTheme, type TocItem } from "@/lib/reader/epub";
import {
  EPUB_RANGES,
  type EpubFont,
  type EpubTheme,
  type ReaderPrefs,
  type SidebarTab,
} from "@/lib/reader/prefs";
import { HighlightsList } from "../shared/HighlightsList";
import { Kbd, ListSkeleton, Section, Segmented, SidebarHeader, SidebarTabs, Slider } from "../shared/SidebarParts";
import { EpubContents } from "./EpubContents";

type EpubTab = Exclude<SidebarTab, "pages">;
type EpubPrefs = Pick<
  ReaderPrefs,
  "epubTheme" | "epubFont" | "epubFontSize" | "epubFontWeight" | "epubLetterSpacing" | "epubLineHeight" | "epubTrim"
>;

type Props = {
  /** false while the panel is closed: the lists aren't rendered then. */
  active: boolean;
  tab: EpubTab;
  onTab: (tab: EpubTab) => void;
  title: string;
  author: string | null;
  cover: string | null;
  /** null until the book's reading percentages are worked out. */
  percent: number | null;
  toc: TocItem[] | null; // null while loading
  chapter: TocItem | null;
  onGoTo: (href: string) => void;
  highlights: Highlight[] | null;
  chapterOf: (highlight: Highlight) => string | null;
  onGoToHighlight: (highlight: Highlight) => void;
  onRemoveHighlight: (id: string) => void;
  prefs: EpubPrefs;
  /** The page colours "Auto" shows right now. */
  autoTheme: EpubPageTheme;
  onPrefs: (patch: Partial<EpubPrefs>) => void;
  onClose: () => void;
};

const TABS: { value: EpubTab; label: string }[] = [
  { value: "contents", label: "Contents" },
  { value: "highlights", label: "Highlights" },
  { value: "settings", label: "Settings" },
];

const THEMES: EpubTheme[] = ["auto", "light", "sepia", "dark"];

const FONTS: { value: EpubFont; label: React.ReactNode; title: string }[] = [
  { value: "publisher", label: "Book", title: "The book's own fonts" },
  { value: "serif", label: <span className="font-serif text-[13px]">Serif</span>, title: "Serif" },
  { value: "sans", label: <span className="font-sans">Sans</span>, title: "Sans serif" },
];

const WEIGHT_NAMES: Record<number, string> = {
  300: "Light",
  400: "Regular",
  500: "Medium",
  600: "Semibold",
  700: "Bold",
  800: "Heavy",
};

export function EpubSidebar(props: Props) {
  const { active, tab, onTab, title, author, cover, percent, toc, chapter, onGoTo, highlights } = props;
  const { chapterOf, onGoToHighlight, onRemoveHighlight, prefs, autoTheme, onPrefs, onClose } = props;

  const detail = [author, percent === null ? null : `${Math.round(percent)}% read`].filter(Boolean).join(" · ");

  return (
    <div className="flex h-full flex-col">
      <SidebarHeader
        title={title}
        label="EPUB"
        cover={cover}
        detail={detail || "EPUB"}
        percent={percent ?? 0}
        onClose={onClose}
      />

      <SidebarTabs tabs={TABS} tab={tab} onTab={onTab} />

      <div role="tabpanel" className="relative mt-2 min-h-0 flex-1 overflow-y-auto">
        {active && tab === "contents" && (toc ? <EpubContents toc={toc} current={chapter} onSelect={onGoTo} /> : <ListSkeleton />)}
        {active && tab === "highlights" && (
          <HighlightsList
            highlights={highlights}
            locationLabel={chapterOf}
            onSelect={onGoToHighlight}
            onRemove={onRemoveHighlight}
          />
        )}
        {tab === "settings" && (
          <div className="space-y-7 p-4 pt-3">
            <Section title="Page colour">
              <div role="radiogroup" aria-label="Page colour" className="grid grid-cols-4 gap-2">
                {THEMES.map((theme) => {
                  const shown = EPUB_THEMES[theme === "auto" ? autoTheme : theme];
                  const selected = prefs.epubTheme === theme;
                  return (
                    <button
                      key={theme}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => onPrefs({ epubTheme: theme })}
                      className="group flex flex-col items-center gap-1.5"
                    >
                      <span
                        className={`relative grid h-12 w-full place-items-center rounded-xl border font-serif text-lg transition ${
                          selected ? "border-accent ring-2 ring-ring" : "border-border group-hover:border-accent/40"
                        }`}
                        style={{ background: shown.bg, color: shown.ink }}
                      >
                        Aa
                        {theme === "auto" && (
                          <span
                            aria-hidden
                            className="absolute inset-y-0 right-0 w-1/2 rounded-r-[11px] opacity-90"
                            style={{ background: `linear-gradient(90deg, transparent, ${EPUB_THEMES.dark.bg} 60%)` }}
                          />
                        )}
                        {selected && (
                          <span className="absolute -right-1.5 -top-1.5 grid size-4 place-items-center rounded-full bg-accent text-accent-ink">
                            <Check className="size-2.5" strokeWidth={3.5} />
                          </span>
                        )}
                      </span>
                      <span className={`text-[11px] ${selected ? "font-medium text-ink" : "text-muted"}`}>
                        {theme === "auto" ? "Auto" : EPUB_THEMES[theme].label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Section>

            <Section title="Typeface">
              <Segmented label="Typeface" options={FONTS} value={prefs.epubFont} onChange={(epubFont) => onPrefs({ epubFont })} />
            </Section>

            <Section title="Margins">
              <Slider
                label="Trim left & right"
                {...EPUB_RANGES.trim}
                value={prefs.epubTrim}
                format={(v) => (v ? `${Math.round(v * 100)}%` : "Off")}
                onChange={(epubTrim) => onPrefs({ epubTrim })}
                ends={["Original", "Edge to edge"]}
              />
            </Section>

            <Section title="Text">
              <div className="space-y-5">
                <Slider
                  label="Size"
                  {...EPUB_RANGES.fontSize}
                  value={prefs.epubFontSize}
                  format={(v) => `${v}%`}
                  onChange={(epubFontSize) => onPrefs({ epubFontSize })}
                  onReset={prefs.epubFontSize !== 100 ? () => onPrefs({ epubFontSize: 100 }) : undefined}
                  ends={["Smaller", "Bigger"]}
                />
                <Slider
                  label="Weight"
                  {...EPUB_RANGES.fontWeight}
                  value={prefs.epubFontWeight || 400}
                  format={(v) => (prefs.epubFontWeight || v !== 400 ? (WEIGHT_NAMES[v] ?? String(v)) : "Book")}
                  onChange={(epubFontWeight) => onPrefs({ epubFontWeight })}
                  onReset={prefs.epubFontWeight ? () => onPrefs({ epubFontWeight: 0 }) : undefined}
                  ends={["Lighter", "Bolder"]}
                />
                <Slider
                  label="Letter spacing"
                  {...EPUB_RANGES.letterSpacing}
                  value={prefs.epubLetterSpacing}
                  format={(v) => (v ? `+${Math.round(v * 1000) / 10}%` : "Normal")}
                  onChange={(epubLetterSpacing) => onPrefs({ epubLetterSpacing })}
                  ends={["Normal", "Wide"]}
                />
                <Slider
                  label="Line spacing"
                  {...EPUB_RANGES.lineHeight}
                  value={prefs.epubLineHeight || 1.5}
                  format={(v) => (prefs.epubLineHeight || v !== 1.5 ? String(Number(v.toFixed(2))) : "Book")}
                  onChange={(epubLineHeight) => onPrefs({ epubLineHeight })}
                  onReset={prefs.epubLineHeight ? () => onPrefs({ epubLineHeight: 0 }) : undefined}
                  ends={["1", "2"]}
                />
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-subtle">
                Weight and line spacing start at the book&apos;s own; Reset goes back to it. Some fonts only have
                regular and bold.
              </p>
            </Section>
          </div>
        )}
      </div>

      <p className="hidden border-t border-border px-4 py-3 text-[11px] leading-relaxed text-subtle lg:block">
        <Kbd>←</Kbd> <Kbd>→</Kbd> turn pages · <Kbd>Ctrl</Kbd> <Kbd>+</Kbd> / <Kbd>−</Kbd> text size
      </p>
    </div>
  );
}
