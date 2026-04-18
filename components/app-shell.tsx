"use client";

import type { ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { useSession } from "@/lib/hooks";

// Page chrome for authenticated, role-scoped screens.
// Wraps children in a sidebar + main content area. Auth pages and the
// capture PWA deliberately skip this — they render full-bleed.

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
    // pages can do their own useRequireRole redirect without competing markup.
    return <>{children}</>;
  }

  const { email, profile } = session;

  return (
    <div className="min-h-screen flex bg-surface-base text-ink">
      <Sidebar role={profile.role} email={email} fullName={profile.full_name} />
      <main className="flex-1 min-w-0 fade-up">{children}</main>
    </div>
  );
}
