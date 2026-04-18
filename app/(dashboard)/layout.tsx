import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";

// Wraps /admin and /team in the sidebar chrome.
export default function DashboardGroupLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
