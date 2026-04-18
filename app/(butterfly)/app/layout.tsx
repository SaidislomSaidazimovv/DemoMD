import type { ReactNode } from "react";
import { BfAppShell } from "@/components/butterfly/app-shell";

// Wraps every Butterfly /app/* page in the scoped theme + top bar.
// The .theme-butterfly class on BfAppShell redefines --bg/--ink/etc. as
// light-theme tokens. Tasdiq's dark tokens outside this subtree are untouched.

export default function ButterflyAppLayout({ children }: { children: ReactNode }) {
  return <BfAppShell>{children}</BfAppShell>;
}
