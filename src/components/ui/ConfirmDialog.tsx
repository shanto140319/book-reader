"use client";

import { useEffect, useRef, type ReactNode } from "react";

type Props = {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  /** "danger" paints the confirm button red, for things that can't be undone. */
  tone?: "default" | "danger";
  icon?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * In-app replacement for window.confirm(). Built on <dialog> + showModal(), so the browser
 * handles the backdrop, keeping focus inside, and Esc. Clicking the backdrop also cancels.
 * Cancel gets the focus, so pressing Enter by reflex never deletes anything.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  tone = "default",
  icon,
  onConfirm,
  onCancel,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="confirm-title"
      onCancel={(e) => {
        e.preventDefault(); // Esc: let the parent close it, so `open` stays the source of truth
        onCancel();
      }}
      onClick={(e) => e.target === e.currentTarget && onCancel()} // backdrop
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-3xl border border-border bg-surface p-0 text-ink shadow-[0_24px_64px_-16px_rgb(0_0_0/0.45)] backdrop:bg-black/45 backdrop:backdrop-blur-[2px] open:animate-dialog-in backdrop:animate-fade-in"
    >
      <div className="p-6 pb-5">
        {icon && (
          <span
            className={`mb-4 grid size-11 place-items-center rounded-2xl ${
              tone === "danger" ? "bg-danger/10 text-danger" : "bg-accent-soft text-accent"
            }`}
          >
            {icon}
          </span>
        )}
        <h2 id="confirm-title" className="font-serif text-xl leading-snug">
          {title}
        </h2>
        {children && <div className="mt-2 text-sm leading-relaxed text-muted">{children}</div>}
      </div>
      <div className="flex gap-2 border-t border-border bg-surface-2/50 px-6 py-4">
        <button
          type="button"
          autoFocus
          onClick={onCancel}
          className="h-10 flex-1 rounded-full border border-border bg-surface text-sm font-medium transition hover:bg-surface-2 active:scale-[0.98]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={`h-10 flex-1 rounded-full text-sm font-medium transition hover:opacity-90 active:scale-[0.98] ${
            tone === "danger" ? "bg-danger text-white" : "bg-ink text-bg"
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
