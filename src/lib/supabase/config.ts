// While .env.local has no Supabase keys, the app runs in "local mode":
// no sign-in, books and progress live in this browser only.
export const supabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);
