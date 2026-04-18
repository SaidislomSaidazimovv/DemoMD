import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";

// /demo runs inside the sidebar chrome. /capture deliberately does not —
// it is a full-bleed mobile PWA.
export default function DemoLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
