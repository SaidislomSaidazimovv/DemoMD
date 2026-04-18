"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ChevronLeft,
  Home,
  FolderClosed,
  Users,
  Video,
  FileText,
  LogOut,
  Settings,
  Menu,
  ShieldCheck,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import type { UserRole } from "@/lib/types";

// Left sidebar navigation per TASDIQ_UI_REDESIGN.md.
// - 240 px wide, collapsible to 64 px.
// - Active route: 3 px accent left-border + subtle background tint.
// - On mobile (<768 px) hidden by default; hamburger opens drawer.
// - User avatar + dropdown at the bottom.

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: UserRole[];
  group?: "primary" | "secondary";
}

const NAV: NavItem[] = [
  { href: "/admin", label: "Home", icon: Home, roles: ["admin"], group: "primary" },
  {
    href: "/dashboard",
    label: "Home",
    icon: Home,
    roles: ["bank_officer", "supervisor"],
    group: "primary",
  },
  {
    href: "/dashboard",
    label: "Projects",
    icon: FolderClosed,
    roles: ["admin", "bank_officer", "supervisor"],
    group: "primary",
  },
  { href: "/team", label: "Team", icon: Users, roles: ["admin"], group: "primary" },
  { href: "/demo", label: "Demo", icon: Video, roles: ["admin"], group: "secondary" },
  {
    href: "/audit",
    label: "Audit trail",
    icon: FileText,
    roles: ["admin", "bank_officer", "supervisor"],
    group: "secondary",
  },
];

export function Sidebar({
  role,
  email,
  fullName,
}: {
  role: UserRole;
  email: string;
  fullName: string;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  // Persist collapse across page navigations
  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("sidebar:collapsed") : null;
    if (saved === "1") setCollapsed(true);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("sidebar:collapsed", collapsed ? "1" : "0");
    } catch {
      // localStorage may be unavailable — ignore, in-memory default is fine
    }
  }, [collapsed]);

  // Close mobile drawer on route change
  useEffect(() => setMobileOpen(false), [pathname]);

  const items = NAV.filter((n) => n.roles.includes(role));
  const primary = items.filter((n) => n.group !== "secondary");
  const secondary = items.filter((n) => n.group === "secondary");

  const initials = fullName
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || email[0]?.toUpperCase() || "?";

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <>
      {/* Mobile hamburger — visible below md */}
      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed top-4 left-4 z-40 rounded-md border border-hairline-subtle bg-surface-card p-2 text-ink-secondary hover:text-ink"
        aria-label="Open navigation"
      >
        <Menu size={20} />
      </button>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/60"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`
          fixed md:sticky top-0 left-0 z-50 h-screen
          flex flex-col
          border-r border-hairline-subtle bg-surface-card
          transition-all duration-slow ease-out
          ${collapsed ? "w-16" : "w-60"}
          ${mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        `}
      >
        {/* Brand */}
        <div className="flex items-center justify-between px-4 h-16 border-b border-hairline-subtle">
          <Link href="/" className="flex items-center gap-2 text-ink">
            <ShieldCheck className="text-accent" size={22} />
            {!collapsed && (
              <span className="text-heading-2 font-bold tracking-tight">Tasdiq</span>
            )}
          </Link>
          <button
            onClick={() => setMobileOpen(false)}
            className="md:hidden text-ink-tertiary hover:text-ink"
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-2">
          <ul className="space-y-0.5">
            {primary.map((item) => (
              <NavLink key={`p-${item.href}-${item.label}`} item={item} active={isActive(pathname, item.href)} collapsed={collapsed} />
            ))}
          </ul>
          {secondary.length > 0 && (
            <>
              <div className="border-t border-hairline-subtle my-4" />
              <ul className="space-y-0.5">
                {secondary.map((item) => (
                  <NavLink
                    key={`s-${item.href}-${item.label}`}
                    item={item}
                    active={isActive(pathname, item.href)}
                    collapsed={collapsed}
                  />
                ))}
              </ul>
            </>
          )}
        </nav>

        {/* Collapse toggle (desktop only) */}
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="hidden md:flex items-center justify-center border-t border-hairline-subtle h-10 text-ink-tertiary hover:text-ink transition-colors"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <ChevronLeft
            size={16}
            className={`transition-transform duration-slow ${collapsed ? "rotate-180" : ""}`}
          />
        </button>

        {/* User menu */}
        <div className="relative border-t border-hairline-subtle p-3">
          <button
            onClick={() => setUserMenuOpen((v) => !v)}
            className={`flex items-center gap-3 w-full rounded-md p-2 hover:bg-surface-elevated transition-colors ${
              collapsed ? "justify-center" : ""
            }`}
          >
            <div className="h-8 w-8 shrink-0 rounded-full bg-accent/20 border border-accent/40 text-accent flex items-center justify-center text-caption font-bold">
              {initials}
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0 text-left">
                <div className="text-caption text-ink truncate">{fullName || email.split("@")[0]}</div>
                <div className="text-micro text-ink-muted truncate">{email}</div>
              </div>
            )}
          </button>
          {userMenuOpen && !collapsed && (
            <div className="absolute bottom-full left-3 right-3 mb-2 rounded-md border border-hairline-strong bg-surface-elevated shadow-xl overflow-hidden">
              <Link
                href="/settings"
                className="flex items-center gap-2 px-3 py-2 text-body text-ink-secondary hover:text-ink hover:bg-surface-card"
              >
                <Settings size={16} /> Settings
              </Link>
              <button
                onClick={signOut}
                className="flex items-center gap-2 px-3 py-2 w-full text-left text-body text-ink-secondary hover:text-ink hover:bg-surface-card"
              >
                <LogOut size={16} /> Sign out
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

function NavLink({
  item,
  active,
  collapsed,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
}) {
  const Icon = item.icon;
  return (
    <li>
      <Link
        href={item.href}
        title={collapsed ? item.label : undefined}
        className={`
          group flex items-center gap-3 rounded-md px-3 py-2
          text-body transition-colors duration-fast relative
          ${active
            ? "bg-accent/10 text-ink font-medium"
            : "text-ink-tertiary hover:text-ink hover:bg-surface-elevated"
          }
        `}
      >
        {active && (
          <span className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r bg-accent" />
        )}
        <Icon
          size={18}
          className={active ? "text-accent" : "text-ink-muted group-hover:text-ink-secondary"}
        />
        {!collapsed && <span>{item.label}</span>}
      </Link>
    </li>
  );
}

// Active when pathname matches exactly or is a nested route.
// /dashboard/project/123 should light up /dashboard.
function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (pathname === href) return true;
  // Don't light up /dashboard for unrelated siblings
  return pathname.startsWith(href + "/");
}
