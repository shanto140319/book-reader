"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { GOOGLE_CLIENT_ID, googleStore, loadGoogle, setOnSignedIn } from "@/lib/auth/google";

type Props = {
  /** Small "Sign in" button for the navbar; the default is the large hero button. */
  compact?: boolean;
};

/** Google draws the button itself into a div; see lib/auth/google.ts for the sign-in flow. */
export function GoogleButton({ compact = false }: Props) {
  const slotRef = useRef<HTMLDivElement>(null);
  const { version, busy, error } = useSyncExternalStore(googleStore.subscribe, googleStore.get, googleStore.getServer);

  const router = useRouter();

  useEffect(loadGoogle, []);
  useEffect(() => setOnSignedIn(() => router.replace("/library")), [router]);

  // Draw (or re-draw after a retry) once Google is initialised.
  useEffect(() => {
    const slot = slotRef.current;
    if (!version || !slot || !window.google) return;
    slot.replaceChildren();
    window.google.accounts.id.renderButton(
      slot,
      compact
        ? { type: "standard", theme: "outline", size: "medium", shape: "pill", text: "signin" }
        : {
            type: "standard",
            theme: "filled_black",
            size: "large",
            shape: "pill",
            text: "continue_with",
            logo_alignment: "left",
            width: 260,
          },
    );
  }, [version, compact]);

  if (!GOOGLE_CLIENT_ID) {
    return compact ? null : (
      <p className="text-sm text-danger">Google sign-in isn&apos;t set up (NEXT_PUBLIC_GOOGLE_CLIENT_ID is missing).</p>
    );
  }

  const status = busy ? "Signing you in…" : !version ? (compact ? "" : "Loading Google sign-in…") : null;

  return (
    <div className="flex flex-col items-start gap-3">
      {/* Fixed height so nothing jumps while Google's button loads. */}
      <div className={`relative ${compact ? "h-8 min-w-20" : "h-11"}`}>
        <div ref={slotRef} className={busy ? "pointer-events-none opacity-50" : undefined} />
        {status !== null && (
          <span className="absolute inset-0 flex items-center gap-2 whitespace-nowrap text-sm text-muted">
            {busy && <Loader2 className="size-4 animate-spin" />}
            {!compact && status}
          </span>
        )}
      </div>
      {error && !compact && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
