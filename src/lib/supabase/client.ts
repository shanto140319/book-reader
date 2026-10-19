import { createBrowserClient } from "@supabase/ssr";

// Supabase client for Client Components ("use client").
// It stores the session in cookies, so the server can read the same login.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
