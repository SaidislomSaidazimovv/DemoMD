import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Route-level auth guard.
//
// Two optimizations that matter for dev perf:
//   1. Skip middleware entirely for /api, /_next, favicon — saves the Supabase
//      setup on every asset request.
//   2. Use getSession() instead of getUser() — getSession decodes + verifies the
//      JWT locally from the cookie (no network). getUser() round-trips to
//      Supabase. For route gating we don't need revocation checking — API
//      routes and page server components still use getUser() where that matters.

const PUBLIC_PATHS = new Set([
  "/",
  "/login",
  "/signup",
  "/verify-email",
  "/accept-invite",
  "/complete-signup",
  "/auth/callback",
]);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Bypass for API routes (they do their own auth) and static assets.
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const res = NextResponse.next({ request: { headers: req.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          req.cookies.set({ name, value, ...options });
          res.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          req.cookies.set({ name, value: "", ...options });
          res.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  // Local-only: decodes + verifies JWT signature from the cookie. No network.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const isAuthed = !!session;

  const isPublic = PUBLIC_PATHS.has(pathname);

  if (!isAuthed && !isPublic) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthed && (pathname === "/login" || pathname === "/signup")) {
    const home = req.nextUrl.clone();
    home.pathname = "/";
    return NextResponse.redirect(home);
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
