"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useSession } from "@/lib/hooks";
import { createClient } from "@/lib/supabase/browser";
import type { User, UserRole } from "@/lib/types";

// Butterfly AppShell. Minimal chrome — a thin top bar with the workspace
// name, primary nav, and a sign-out link. No sidebar.
//
// Auth pattern:
//   - useSession() runs ONCE here, inside the layout. Because Next's App
//     Router preserves layouts across navigations within the same route
//     group, the session fetch doesn't re-run every time you click a
//     Butterfly nav link.
//   - The session is exposed via BfSessionContext. Pages read from the
//     context with useBfSession() — no new supabase round-trip.
//   - This shell also enforces that the signed-in user belongs to a
//     Butterfly role (or is an admin). Wrong-role users get redirected
//     out; unauthenticated users get caught by middleware before reaching
//     here.

const ALLOWED_ROLES: UserRole[] = ["hr_admin", "manager", "responder", "admin"];

const NAV = [
  { href: "/app/home", label: "Home" },
  { href: "/app/journey", label: "Journey" },
  { href: "/app/training", label: "Training" },
  { href: "/app/checkin", label: "Check-in" },
  { href: "/app/reports", label: "Reports" },
  { href: "/app/privacy", label: "Privacy" },
  { href: "/app/deploy", label: "Deploy" },
];

interface BfSessionValue {
  userId: string;
  email: string;
  profile: User;
}

const BfSessionContext = createContext<BfSessionValue | null>(null);

/** Read the Butterfly session without re-fetching. Never null inside the shell. */
export function useBfSession(): BfSessionValue {
  const ctx = useContext(BfSessionContext);
  if (!ctx) {
    throw new Error(
      "useBfSession must be used inside BfAppShell — are you rendering a Butterfly page outside the (butterfly)/app layout?"
    );
  }
  return ctx;
}

export function BfAppShell({ children }: { children: ReactNode }) {
  const { session, loading } = useSession();
  const pathname = usePathname();

  // Wrong-role / no-profile users bounce. Middleware already catches the
  // unauthenticated case; this handles "signed in as Tasdiq admin on a
  // Butterfly URL" gracefully.
  useEffect(() => {
    if (loading) return;
    if (!session) return;
    const role = session.profile?.role;
    if (!role || !ALLOWED_ROLES.includes(role)) {
      window.location.href = "/";
    }
  }, [loading, session]);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  if (loading || !session || !session.profile) {
    return (
      <div className="theme-butterfly min-h-screen flex items-center justify-center">
        <span className="text-[color:var(--bf-caption)]">Loading…</span>
      </div>
    );
  }

  const value: BfSessionValue = {
    userId: session.userId,
    email: session.email,
    profile: session.profile,
  };

  return (
    <BfSessionContext.Provider value={value}>
      <div className="theme-butterfly min-h-screen flex flex-col">
        <header className="border-b border-[color:var(--bf-hair)] bg-[color:var(--bf-bg)]">
          <div className="max-w-6xl mx-auto px-6 sm:px-10 py-5 flex items-center gap-8">
            <Link
              href="/app/home"
              className="font-semibold text-[color:var(--bf-ink)] tracking-tight text-[17px]"
            >
              Butterfly
            </Link>
            <nav className="flex items-center gap-5 overflow-x-auto text-[14px]">
              {NAV.map((item) => {
                const active =
                  pathname === item.href ||
                  (item.href !== "/app/home" && pathname?.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch
                    className={`
                      whitespace-nowrap transition-colors duration-150
                      ${active
                        ? "text-[color:var(--bf-ink)]"
                        : "text-[color:var(--bf-caption)] hover:text-[color:var(--bf-ink)]"
                      }
                    `}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <div className="ml-auto flex items-center gap-4 text-[13px]">
              <span className="text-[color:var(--bf-caption)] hidden sm:inline">
                {session.email}
              </span>
              <button
                onClick={signOut}
                className="text-[color:var(--bf-caption)] hover:text-[color:var(--bf-ink)] transition-colors"
              >
                Sign out
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1">{children}</main>
      </div>
    </BfSessionContext.Provider>
  );
}
