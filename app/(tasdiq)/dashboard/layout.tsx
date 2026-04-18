import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";

// Wraps /dashboard and /dashboard/project/[id] in the sidebar chrome.
// /capture and /demo sit outside this segment so they can render full-bleed.
export default function BankDashboardLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
