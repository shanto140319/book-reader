import { supabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
};

/**
 * The signed-in user, or null. Uses getClaims(), which verifies the session
 * token's signature, so this is safe to trust on the server.
 * Google profile fields arrive in `user_metadata`.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  if (!supabaseConfigured) return null;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) return null;

  const meta = (claims.user_metadata ?? {}) as Record<string, string | undefined>;
  const email = claims.email ?? "";
  return {
    id: claims.sub,
    email,
    name: meta.full_name ?? meta.name ?? email.split("@")[0],
    avatarUrl: meta.avatar_url ?? meta.picture ?? null,
  };
}
