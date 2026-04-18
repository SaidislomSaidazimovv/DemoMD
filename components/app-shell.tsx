"use client";

import {
  createContext,
  useContext,
  useEffect,
  type ReactNode,
} from "react";
import { Sidebar } from "./sidebar";
import { useSession } from "@/lib/hooks";
import type { User, UserRole } from "@/lib/types";

// Page chrome for authenticated, role-scoped Tasdiq screens.
// Wraps children in a sidebar + main content area.
//
// Auth pattern:
//   - useSession() runs ONCE here, inside the shell. Because Next's App
//     Router preserves layouts across navigations inside the same route
//     group, the session fetch doesn't re-run when you click sidebar links.
//   - Session is exposed via TasdiqSessionContext. Pages read from context
//     (zero latency) instead of re-fetching via useRequireRole (which used
//     to trigger a fresh supabase round-trip on every mount).
//   - Role enforcement — the shell does NOT redirect wrong-role users. That
//     stays page-level via useRequireRoleFromContext, because which roles
//     are allowed differs by page (admin vs dashboard vs capture).

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
 * Page-level role gate that redirects if the session role isn't allowed.
 * Reads from context (no Supabase round-trip). Drop-in replacement for the
 * old `useRequireRole` on pages wrapped by AppShell.
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

export function AppShell({ children }: { children: ReactNode }) {
  const { session, loading } = useSession();
  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center text-ink-muted">
        Loading…
      </main>
    );
  }
  if (!session || !session.profile) {
    // Not signed in, or no profile yet — render children as-is so individual
    // pages can handle the unauth case (e.g. /admin redirects to /login via
    // middleware; we just don't provide the context here).
    return <>{children}</>;
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
