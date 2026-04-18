"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useSession } from "@/lib/hooks";
import { createClient } from "@/lib/supabase/browser";

// Butterfly AppShell. Minimal chrome — a thin top bar with the workspace name,
// primary nav, and a sign-out link. No sidebar. The spec prizes breathing room;
// each screen is meant to feel alone on the page.

const NAV = [
  { href: "/app/home", label: "Home" },
  { href: "/app/journey", label: "Journey" },
  { href: "/app/training", label: "Training" },
  { href: "/app/checkin", label: "Check-in" },
  { href: "/app/reports", label: "Reports" },
  { href: "/app/privacy", label: "Privacy" },
  { href: "/app/deploy", label: "Deploy" },
];

export function BfAppShell({ children }: { children: ReactNode }) {
  const { session, loading } = useSession();
  const pathname = usePathname();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  if (loading) {
    return (
      <div className="theme-butterfly min-h-screen flex items-center justify-center">
        <span className="text-[color:var(--bf-caption)]">Loading…</span>
      </div>
    );
  }

  return (
    <div className="theme-butterfly min-h-screen flex flex-col">
      <header className="border-b border-[color:var(--bf-hair)] bg-[color:var(--bf-bg)]">
        <div className="max-w-6xl mx-auto px-6 sm:px-10 py-5 flex items-center gap-8">
          <Link href="/app/home" className="font-semibold text-[color:var(--bf-ink)] tracking-tight text-[17px]">
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
            {session?.email && (
              <span className="text-[color:var(--bf-caption)] hidden sm:inline">
                {session.email}
              </span>
            )}
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
  );
}
