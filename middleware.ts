import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Route-level auth guard.
//
// Perf notes:
//   1. Skip middleware entirely for /api, /_next, favicon, and /auth/callback —
//      saves the Supabase setup on every asset request. This is the biggest win.
//   2. Use getUser() (not getSession) — getUser verifies the token against the
//      Supabase Auth server. getSession() only decodes the cookie locally and
//      may trust a forged or revoked token. The ~1 round-trip per page
//      navigation is worth it for correct auth semantics.

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

  // Bypass for API routes (they do their own auth), static assets, and the
  // OAuth/email callback (it handles its own session hydration client-side).
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/auth/callback"
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

  // Server-verified: round-trips to Supabase Auth to confirm the token is
  // still valid (not revoked, not expired, not forged). This is what
  // @supabase/ssr requires for server-side auth decisions.
  //
  // Benign failure mode: if the browser still holds an `sb-*-auth-token`
  // cookie but the embedded refresh token has expired or been rotated away
  // (typical after Supabase restarts, project key rotations, or long idle
  // periods), getUser() resolves with `{ user: null, error }` AND
  // @supabase/ssr logs `Invalid Refresh Token: Refresh Token Not Found` to
  // stderr. We can't silence the internal log, but we can clear the stale
  // cookies so the NEXT request doesn't carry them, which makes the log a
  // one-shot nuisance instead of happening on every page nav.
  const { data, error } = await supabase.auth.getUser();
  const user = data?.user ?? null;
  if (error && isRefreshError(error)) {
    for (const c of req.cookies.getAll()) {
      if (c.name.startsWith("sb-")) res.cookies.delete(c.name);
    }
  }
  const isAuthed = !!user;

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

// Supabase surfaces refresh-token failure in a few shapes depending on version.
// Check code first (newer SDKs) and fall back to message substring.
function isRefreshError(err: { code?: string; message?: string }): boolean {
  if (err.code === "refresh_token_not_found") return true;
  const m = (err.message ?? "").toLowerCase();
  return m.includes("refresh token") || m.includes("refresh_token");
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
