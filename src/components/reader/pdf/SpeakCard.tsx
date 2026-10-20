"use client";

import { Play, Square, X } from "lucide-react";
import { useState, useSyncExternalStore, type RefObject } from "react";
import { changeRate, loadRate, speak, speech, SPEECH_RATES, stopSpeaking, type SpeechRate } from "@/lib/reader/speech";
import { keepSelection, useMenuPosition, type MenuAnchor } from "./HighlightMenu";

type Props = {
  text: string;
  anchor: MenuAnchor;
  scrollerRef: RefObject<HTMLElement | null>;
  onClose: () => void;
};

/**
 * Small player shown while the selected text is read aloud. Reading starts in the tap that
 * opens it (see PdfScrollView), because iPhone only allows speech started by a tap.
 * Closing the card, or any other menu replacing it, stops the voice (PdfScrollView does that).
 */
export function SpeakCard({ text, anchor, scrollerRef, onClose }: Props) {
  const { speaking } = useSyncExternalStore(speech.subscribe, speech.getSnapshot, speech.getServerSnapshot);
  const [rate, setRate] = useState<SpeechRate>(loadRate);
  const { ref, style } = useMenuPosition(anchor, scrollerRef, speaking); // "Reading" / "Done" differ in width

  function pickRate(r: SpeechRate) {
    setRate(r);
    changeRate(r); // continues from the current word at the new speed
  }

  return (
    <div
      ref={ref}
      role="group"
      aria-label="Read aloud"
      {...keepSelection}
      style={style}
      className="absolute z-10 flex items-center gap-1 rounded-full border border-border bg-surface p-1.5 shadow-[0_8px_30px_-6px_rgb(0_0_0/0.3)] select-none"
    >
      <button
        type="button"
        aria-label={speaking ? "Stop reading" : "Read again"}
        title={speaking ? "Stop" : "Read again"}
        onClick={() => (speaking ? stopSpeaking() : speak(text, rate))}
        className="grid size-8 place-items-center rounded-full bg-ink text-bg transition hover:opacity-90 active:scale-90"
      >
        {speaking ? <Square className="size-3.5 fill-current" /> : <Play className="size-3.5 translate-x-px fill-current" />}
      </button>

      <span className="flex h-8 items-center gap-2 px-2 text-xs text-muted" aria-live="polite">
        {speaking ? <SoundBars /> : null}
        {speaking ? "Reading" : "Done"}
      </span>

      <div role="radiogroup" aria-label="Speed" className="flex rounded-full bg-surface-2 p-0.5">
        {SPEECH_RATES.map((r) => (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={rate === r}
            onClick={() => pickRate(r)}
            className={`h-7 rounded-full px-2 text-[11px] font-medium tabular-nums transition ${
              rate === r ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"
            }`}
          >
            {r}×
          </button>
        ))}
      </div>

      <button
        type="button"
        aria-label="Close"
        title="Close"
        onClick={onClose}
        className="grid size-8 place-items-center rounded-full text-muted transition hover:bg-surface-2 hover:text-ink active:scale-90"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

/** Three little bars bouncing while the voice is playing. */
function SoundBars() {
  return (
    <span aria-hidden className="flex h-3 items-end gap-[2px]">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="w-[3px] animate-sound-bar rounded-full bg-accent"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}
