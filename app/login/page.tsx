"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/mock-db";

const roleRoute = {
  admin: "/admin",
  inspector: "/capture",
  bank_officer: "/dashboard",
  supervisor: "/dashboard",
} as const;

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("banker@tasdiq.uz");
  const [password, setPassword] = useState("demo123");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error || !data) {
      setError(error?.message ?? "Login failed");
      return;
    }
    const dest = roleRoute[data.user.role as keyof typeof roleRoute] ?? "/";
    router.replace(dest);
  }

  function fillAs(e: string) {
    setEmail(e);
    setPassword("demo123");
    setError(null);
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Tasdiq</h1>
          <p className="text-slate-400 text-sm mt-1">Sign in to continue</p>
        </div>

        <form onSubmit={submit} className="space-y-4 rounded-xl border border-slate-700 bg-slate-900/60 p-6">
          <div>
            <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          {error && (
            <div className="rounded border border-rose-700/50 bg-rose-900/20 px-3 py-2 text-sm text-rose-300">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-brand hover:bg-brand/90 px-4 py-2 text-sm font-semibold text-brand-fg disabled:opacity-50"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-xs text-slate-400 space-y-2">
          <p className="font-semibold text-slate-300">Demo accounts (password: demo123)</p>
          {[
            { email: "admin@tasdiq.uz", role: "admin", dest: "/admin" },
            { email: "inspector@tasdiq.uz", role: "inspector", dest: "/capture" },
            { email: "banker@tasdiq.uz", role: "bank_officer", dest: "/dashboard" },
          ].map((u) => (
            <button
              key={u.email}
              onClick={() => fillAs(u.email)}
              className="w-full flex items-center justify-between rounded border border-slate-800 bg-slate-950/50 px-3 py-1.5 hover:bg-slate-800/50 transition text-left"
            >
              <span>
                <span className="font-mono text-slate-200">{u.email}</span>
                <span className="ml-2 text-slate-500">· {u.role}</span>
              </span>
              <span className="text-slate-500">{u.dest}</span>
            </button>
          ))}
        </div>

        <div className="text-center">
          <Link href="/" className="text-xs text-slate-500 hover:text-slate-300">
            ← back to landing
          </Link>
        </div>
      </div>
    </main>
  );
}
