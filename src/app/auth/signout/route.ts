import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  await supabase.auth.signOut();
  // 303 (not the default 307) so the browser follows up with a GET. A 307
  // re-sends the POST to /login, which is a static page in production builds
  // and rejects it with "405 Method Not Allowed".
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
