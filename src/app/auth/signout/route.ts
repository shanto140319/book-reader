import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// POST only, so a link prefetch or image tag can't sign someone out.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // 303 makes the browser follow the redirect with GET.
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
