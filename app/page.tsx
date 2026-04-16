import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-2xl w-full space-y-8">
        <div>
          <h1 className="text-4xl font-bold">Tasdiq Demo</h1>
          <p className="text-slate-400 mt-2">
            Construction milestone verification for banks — 5-layer fraud detection, tamper-evident
            hash-chain ledger, realtime dashboard. Self-contained in-memory demo.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <LinkCard href="/login" title="Login →" subtitle="admin / inspector / banker · demo123" />
          <LinkCard href="/demo" title="Demo Control →" subtitle="Simulate REAL or FRAUD captures" />
          <LinkCard href="/dashboard" title="Bank Dashboard →" subtitle="KPIs, project detail, realtime" />
          <LinkCard href="/capture" title="Inspector PWA →" subtitle="Camera + GPS + sensors" />
        </div>

        <div className="rounded border border-slate-800 bg-slate-900/60 p-4 text-xs text-slate-400 space-y-1.5">
          <p className="text-slate-300 font-semibold">How the demo flows:</p>
          <p>
            1. Log in with{" "}
            <span className="font-mono text-slate-200">banker@tasdiq.uz / demo123</span> — routes
            you to <span className="font-mono">/dashboard</span>.
          </p>
          <p>
            2. In another tab, open <span className="font-mono">/demo</span> and click{" "}
            <span className="text-rose-300">🚨 FRAUD</span> or{" "}
            <span className="text-emerald-300">✅ REAL</span> — the dashboard updates instantly via
            realtime.
          </p>
          <p>
            3. Or log in as{" "}
            <span className="font-mono text-slate-200">inspector@tasdiq.uz / demo123</span> and use{" "}
            <span className="font-mono">/capture</span> on a phone for the real camera + sensor
            capture flow.
          </p>
        </div>
      </div>
    </main>
  );
}

function LinkCard({ href, title, subtitle }: { href: string; title: string; subtitle: string }) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 p-5 text-center transition"
    >
      <div className="text-lg font-semibold">{title}</div>
      <div className="text-xs text-slate-400 mt-1">{subtitle}</div>
    </Link>
  );
}
