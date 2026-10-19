import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Google → Supabase → here, with ?code=... in the URL.
// We swap that one-time code for a session, which @supabase/ssr stores in cookies.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}/library`);
  }

  return NextResponse.redirect(`${origin}/?error=auth`);
}
