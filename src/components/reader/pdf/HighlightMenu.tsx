"use client";

import { Check, Copy, Trash2 } from "lucide-react";
import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { HIGHLIGHT_COLORS, type HighlightColor } from "@/lib/library/types";
import { HIGHLIGHT_FILL, HIGHLIGHT_LABEL } from "@/lib/reader/highlights";

/** Where the menu points at, in the scroll area's content coordinates (so it scrolls with the page). */
export type MenuAnchor = { top: number; bottom: number; x: number };

type Props = {
  anchor: MenuAnchor;
  scrollerRef: RefObject<HTMLElement | null>;
  /** Set when editing an existing highlight: its colour is ticked and Remove is shown. */
  current?: HighlightColor;
  onColor: (color: HighlightColor) => void;
  onCopy: () => void;
  onTranslate: () => void;
  onDelete?: () => void;
};

const GAP = 10;
const EDGE = 8;

/**
 * Places a popup (this menu, or the translation card) below its anchor, or above it near the
 * bottom of the screen, kept inside the visible part of the scroll area. Returns the ref to put
 * on the popup and its style. Pass `contentKey` to re-measure when the popup's size changes.
 */
export function useMenuPosition(anchor: MenuAnchor, scrollerRef: RefObject<HTMLElement | null>, contentKey?: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const scroller = scrollerRef.current;
    if (!el || !scroller) return;
    const { offsetWidth: w, offsetHeight: h } = el;
    const viewTop = scroller.scrollTop;
    const viewBottom = viewTop + scroller.clientHeight;
    let top = anchor.bottom + GAP;
    if (top + h > viewBottom - EDGE && anchor.top - GAP - h > viewTop + EDGE) top = anchor.top - GAP - h;
    const minLeft = scroller.scrollLeft + EDGE;
    const maxLeft = scroller.scrollLeft + scroller.clientWidth - w - EDGE;
    setPos({ top, left: Math.max(minLeft, Math.min(maxLeft, anchor.x - w / 2)) });
  }, [anchor, scrollerRef, contentKey]);

  const style = pos ?? { top: anchor.bottom + GAP, left: anchor.x, visibility: "hidden" as const };
  return { ref, style };
}

/**
 * Keep the text selected while pressing inside a popup (mouse), don't start a new selection,
 * and don't let the tap reach the page (which would close the popup).
 */
export const keepSelection = {
  onPointerDown: (e: React.PointerEvent) => e.preventDefault(),
  onMouseDown: (e: React.MouseEvent) => e.preventDefault(),
  onClick: (e: React.MouseEvent) => e.stopPropagation(),
};

/**
 * Colour picker shown below the selection (or above, near the bottom of the screen). Below,
 * because phones put their own Copy / Select all menu above the selection.
 */
export function HighlightMenu({ anchor, scrollerRef, current, onColor, onCopy, onTranslate, onDelete }: Props) {
  const { ref, style } = useMenuPosition(anchor, scrollerRef);

  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label={current ? "Edit highlight" : "Highlight"}
      {...keepSelection}
      style={style}
      className="absolute z-10 flex items-center gap-1 rounded-full border border-border bg-surface p-1.5 shadow-[0_8px_30px_-6px_rgb(0_0_0/0.3)] select-none"
    >
      {HIGHLIGHT_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          aria-label={HIGHLIGHT_LABEL[color]}
          aria-pressed={current === color}
          title={HIGHLIGHT_LABEL[color]}
          onClick={() => onColor(color)}
          className="grid size-8 place-items-center rounded-full transition active:scale-90"
        >
          <span
            className="grid size-6 place-items-center rounded-full ring-1 ring-black/10 transition hover:scale-110"
            style={{ background: HIGHLIGHT_FILL[color] }}
          >
            {current === color && <Check className="size-3.5 text-neutral-800" strokeWidth={3} />}
          </span>
        </button>
      ))}
      <span aria-hidden className="mx-0.5 h-5 w-px bg-border" />
      <MenuButton label="Copy text" onClick={onCopy}>
        <Copy className="size-4" />
      </MenuButton>
      <button
        type="button"
        title="Translate to Bangla"
        aria-label="Translate to Bangla"
        onClick={onTranslate}
        lang="bn"
        className="h-8 rounded-full px-2.5 font-bangla text-[13px] text-muted transition hover:bg-surface-2 hover:text-ink active:scale-95"
      >
        বাংলা
      </button>
      {onDelete && (
        <MenuButton label="Remove highlight" onClick={onDelete} danger>
          <Trash2 className="size-4" />
        </MenuButton>
      )}
    </div>
  );
}

function MenuButton({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`grid size-8 place-items-center rounded-full text-muted transition hover:bg-surface-2 active:scale-90 ${
        danger ? "hover:text-danger" : "hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
