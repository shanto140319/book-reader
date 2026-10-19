// "Sign in with Google" via Google Identity Services (a popup on our own page), not Supabase's
// redirect flow. Google hands the page an ID token and we pass it to Supabase. Because Google
// never redirects to supabase.co, its consent screen shows this site's domain instead.
//
// Shared by every Google button on the page (hero + navbar): the script loads once, Google is
// initialised once, and all buttons read the same state.

import { createClient } from "@/lib/supabase/client";

export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

export type GoogleState = {
  /** Bumped each time Google is (re)initialised; buttons re-draw when it changes. */
  version: number;
  busy: boolean;
  error: string | null;
};

const SERVER_STATE: GoogleState = { version: 0, busy: false, error: null };
let state = SERVER_STATE;
const listeners = new Set<() => void>();
let loading = false;
let onSignedIn: (() => void) | undefined;

/** What to do after a successful sign-in (buttons pass a router navigation). */
export function setOnSignedIn(fn: () => void) {
  onSignedIn = fn;
}

function update(patch: Partial<GoogleState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export const googleStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  get: () => state,
  getServer: () => SERVER_STATE,
};

/** Loads Google's script once and initialises it. Safe to call from every button. */
export function loadGoogle() {
  if (loading || !GOOGLE_CLIENT_ID) return;
  loading = true;
  if (window.google) {
    void init();
    return;
  }
  const script = document.createElement("script");
  script.src = "https://accounts.google.com/gsi/client";
  script.async = true;
  script.onload = () => void init();
  script.onerror = () => {
    loading = false;
    update({ error: "Couldn't load Google sign-in. Check your connection." });
  };
  document.head.append(script);
}

async function init() {
  // Nonce: Google puts sha256(nonce) inside the token, and Supabase checks it against the raw
  // nonce we send. So a token stolen from somewhere else can't be replayed to log in here.
  const nonce = crypto.randomUUID();
  const hashedNonce = await sha256Hex(nonce);

  window.google!.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID!,
    nonce: hashedNonce,
    callback: async ({ credential }) => {
      update({ busy: true, error: null });
      const { error } = await createClient().auth.signInWithIdToken({ provider: "google", token: credential, nonce });
      if (error) {
        update({ busy: false, error: error.message });
        void init(); // fresh nonce for the next try
        return;
      }
      // The session is now in cookies, so the server-rendered library sees the login.
      onSignedIn?.();
    },
  });
  update({ version: state.version + 1 });
}

async function sha256Hex(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

// The small part of Google Identity Services this app uses.
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(config: {
            client_id: string;
            nonce?: string;
            callback: (response: { credential: string }) => void;
          }): void;
          renderButton(parent: HTMLElement, options: Record<string, string | number>): void;
        };
      };
    };
  }
}
