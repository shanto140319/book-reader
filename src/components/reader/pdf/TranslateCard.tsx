"use client";

import { Check, Copy, RotateCw, X } from "lucide-react";
import { useEffect, useState, type RefObject } from "react";
import { translateToBangla } from "@/lib/reader/translate";
import { keepSelection, useMenuPosition, type MenuAnchor } from "./HighlightMenu";

type Props = {
  text: string;
  anchor: MenuAnchor;
  scrollerRef: RefObject<HTMLElement | null>;
  onClose: () => void;
};

type Result = { ok: true; text: string } | { ok: false; error: string };

/**
 * Bangla translation of the selected text, in a card where the toolbar was. Give it
 * `key={text}` so a new selection starts fresh.
 */
export function TranslateCard({ text, anchor, scrollerRef, onClose }: Props) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result | null>(null); // null = translating
  const [copied, setCopied] = useState(false);
  // Re-placed when the content arrives, since the card grows from the loading lines.
  const { ref, style } = useMenuPosition(anchor, scrollerRef, result);

  useEffect(() => {
    let cancelled = false;
    translateToBangla(text).then(
      (bangla) => !cancelled && setResult({ ok: true, text: bangla }),
      (error: Error) => !cancelled && setResult({ ok: false, error: error.message }),
    );
    return () => {
      cancelled = true;
    };
  }, [text, attempt]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  function retry() {
    setResult(null);
    setAttempt((a) => a + 1);
  }

  function copy() {
    if (!result?.ok) return;
    navigator.clipboard?.writeText(result.text).then(() => setCopied(true), () => {});
  }

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Bangla translation"
      {...keepSelection}
      style={style}
      className="absolute z-10 flex w-[min(calc(100vw-1rem),380px)] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_12px_40px_-8px_rgb(0_0_0/0.35)]"
    >
      <div className="flex items-center gap-2 border-b border-border py-1.5 pl-4 pr-1.5">
        <span lang="bn" className="flex-1 font-bangla text-[13px] text-muted">
          বাংলা অনুবাদ
        </span>
        {result?.ok && (
          <CardButton label={copied ? "Copied" : "Copy translation"} onClick={copy}>
            {copied ? <Check className="size-4 text-accent" /> : <Copy className="size-4" />}
          </CardButton>
        )}
        <CardButton label="Close" onClick={onClose}>
          <X className="size-4" />
        </CardButton>
      </div>

      <div className="max-h-[40vh] overflow-y-auto overscroll-contain px-4 py-3" aria-live="polite">
        {result === null ? (
          <div aria-busy aria-label="Translating" className="animate-pulse space-y-2.5 py-1">
            <div className="h-2.5 w-[92%] rounded-full bg-surface-2" />
            <div className="h-2.5 w-[78%] rounded-full bg-surface-2" />
            <div className="h-2.5 w-[55%] rounded-full bg-surface-2" />
          </div>
        ) : result.ok ? (
          <p lang="bn" className="whitespace-pre-line font-bangla text-[16px] leading-[1.75] text-ink">
            {result.text}
          </p>
        ) : (
          <div className="flex items-start gap-3">
            <p className="flex-1 text-sm leading-relaxed text-danger">{result.error}</p>
            <button
              type="button"
              onClick={retry}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-medium transition hover:bg-surface-2"
            >
              <RotateCw className="size-3.5" />
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function CardButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid size-8 place-items-center rounded-full text-muted transition hover:bg-surface-2 hover:text-ink active:scale-90"
    >
      {children}
    </button>
  );
}
