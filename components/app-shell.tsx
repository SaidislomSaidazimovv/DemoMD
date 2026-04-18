"use client";

import {
  createContext,
  useContext,
  useEffect,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { useSession } from "@/lib/hooks";
import type { User, UserRole } from "@/lib/types";

// Page chrome for authenticated, role-scoped Tasdiq screens.
//
// Auth pattern:
//   - useSession() runs ONCE here (Next preserves layouts across navigations
//     inside the same route group). Session is exposed via context; pages
//     read with useTasdiqSession() — no per-page Supabase round-trip.
//   - Role gating is done HERE, based on the pathname, so wrong-role users
//     never see the page content. Previous design put the gate in a
//     per-page useEffect, which ran *after* the page painted — you'd see
//     a half-second flash of /admin before being redirected. This shell
//     blocks rendering up-front for mismatches and shows a minimal
//     "Redirecting…" placeholder.

interface TasdiqSessionValue {
  userId: string;
  email: string;
  profile: User;
}

const TasdiqSessionContext = createContext<TasdiqSessionValue | null>(null);

/** Read the Tasdiq session inside an AppShell-wrapped page (sync, no fetch). */
export function useTasdiqSession(): TasdiqSessionValue {
  const ctx = useContext(TasdiqSessionContext);
  if (!ctx) {
    throw new Error(
      "useTasdiqSession must be used inside AppShell. Are you rendering a page outside (dashboard) or (tasdiq)/dashboard?"
    );
  }
  return ctx;
}

/**
 * Defensive page-level role gate. The shell already gates by pathname, so
 * this is redundant in practice — kept for readability on each page, and so
 * that a typo in the shell's route map doesn't silently expose a page.
 */
export function useRequireRoleFromContext(allowed: UserRole[], onDenied = "/") {
  const session = useTasdiqSession();
  useEffect(() => {
    if (allowed.length > 0 && !allowed.includes(session.profile.role)) {
      window.location.href = onDenied;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.profile.role, allowed.join(","), onDenied]);
  return session;
}

// ------------------------------------------------------------
// Pathname → allowed roles map.
// Pages not listed here are ungated by the shell (but still protected by
// middleware for auth, and can add their own per-page role check).
// ------------------------------------------------------------
function allowedRolesForPath(pathname: string | null): UserRole[] | null {
  if (!pathname) return null;
  if (pathname === "/admin") return ["admin"];
  if (pathname === "/team") return ["admin"];
  if (pathname === "/audit") return ["admin", "bank_officer", "supervisor"];
  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) {
    return ["admin", "bank_officer", "supervisor"];
  }
  if (pathname === "/demo") return ["admin", "bank_officer"];
  return null;
}

export function AppShell({ children }: { children: ReactNode }) {
  const { session, loading } = useSession();
  const pathname = usePathname();

  // Resolve allowed roles up-front. The returned value is `null` when the
  // current path is unknown to the shell, which means "don't gate".
  const allowed = allowedRolesForPath(pathname);
  const role = session?.profile?.role;
  const roleMismatch =
    !!allowed && !!role && !allowed.includes(role);

  // Fire the redirect as an effect — setting window.location.href inside
  // render would trip hydration warnings.
  useEffect(() => {
    if (loading) return;
    if (!session || !session.profile) return;
    if (roleMismatch) {
      window.location.href = "/";
    }
  }, [loading, session, roleMismatch]);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center text-ink-muted">
        Loading…
      </main>
    );
  }
  if (!session || !session.profile) {
    // Not signed in, or no profile yet — render children as-is so individual
    // pages can handle the unauth case (e.g. /admin still gets caught by
    // middleware's auth redirect; we just don't expose the context here).
    return <>{children}</>;
  }

  // Wrong role for this path — show a minimal placeholder. The effect above
  // fires the actual redirect. No page content renders.
  if (roleMismatch) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-surface-base text-ink-muted">
        <div className="flex items-center gap-3">
          <span className="inline-block h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
          <span className="text-body">Redirecting…</span>
        </div>
      </main>
    );
  }

  const { email, profile } = session;
  const value: TasdiqSessionValue = {
    userId: session.userId,
    email,
    profile,
  };

  return (
    <TasdiqSessionContext.Provider value={value}>
      <div className="min-h-screen flex bg-surface-base text-ink">
        <Sidebar role={profile.role} email={email} fullName={profile.full_name} />
        <main className="flex-1 min-w-0 fade-up">{children}</main>
      </div>
    </TasdiqSessionContext.Provider>
  );
}
