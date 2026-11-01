import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { safeRedirectPath } from "@/lib/utils";

// Keeps the Supabase login fresh on every request (refreshing an expired
// access token and writing the new cookies), protects /dashboard, and sends
// signed-in people away from /login and /signup.
//
// Without this, a session older than an hour went stale: pages still loaded
// (the server could read the login), but the browser's own requests reached
// the database as a signed-out visitor, so saves failed with errors like
// "permission denied for table saved_locations".
export async function middleware(request: NextRequest) {
  // Visitors who aren't signed in (most buyers) have no session to refresh.
  const hasSession = request.cookies.getAll().some((c) => c.name.startsWith("sb-"));
  const path = request.nextUrl.pathname;
  const isDashboardRoute = path.startsWith("/dashboard");
  if (!hasSession && !isDashboardRoute) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const redirectKeepingCookies = (url: URL) => {
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  };

  if (!user && isDashboardRoute) {
    const url = new URL("/login", request.url);
    url.searchParams.set("redirectTo", path + request.nextUrl.search);
    return redirectKeepingCookies(url);
  }

  if (user && (path.startsWith("/login") || path.startsWith("/signup"))) {
    const to = safeRedirectPath(request.nextUrl.searchParams.get("redirectTo"));
    return redirectKeepingCookies(new URL(to, request.url));
  }

  return response;
}

export const config = {
  // everything except static files, images and Stripe's webhook (which has no login)
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/stripe/webhook|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
