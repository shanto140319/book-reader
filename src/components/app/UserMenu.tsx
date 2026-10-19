"use client";

import { LogOut } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { library } from "@/lib/library";

type Props = { name: string; email: string; avatarUrl: string | null };

export function UserMenu({ name, email, avatarUrl }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Account menu"
        className="rounded-full ring-offset-2 ring-offset-bg transition hover:ring-2 hover:ring-border"
      >
        <Avatar name={name} avatarUrl={avatarUrl} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-64 origin-top-right overflow-hidden rounded-2xl border border-border bg-surface shadow-card"
        >
          <div className="flex items-center gap-3 border-b border-border p-4">
            <Avatar name={name} avatarUrl={avatarUrl} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{name}</p>
              <p className="truncate text-xs text-muted">{email}</p>
            </div>
          </div>
          <form
            action="/auth/signout"
            method="post"
            className="p-1.5"
            onSubmit={async (e) => {
              // Remove this account's downloaded books from the browser before signing out
              // (matters on shared computers).
              e.preventDefault();
              const form = e.currentTarget;
              await library.clearCache().catch(() => {});
              form.submit();
            }}
          >
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-muted transition hover:bg-surface-2 hover:text-ink"
            >
              <LogOut className="size-4" />
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function Avatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  if (avatarUrl) {
    return <Image src={avatarUrl} alt="" width={36} height={36} className="size-9 rounded-full object-cover" />;
  }
  return (
    <span className="grid size-9 place-items-center rounded-full bg-accent-soft text-sm font-semibold text-accent">
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
