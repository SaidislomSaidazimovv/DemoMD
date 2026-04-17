"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

const roleRoute: Record<string, string> = {
  admin: "/admin",
  inspector: "/capture",
  bank_officer: "/dashboard",
  supervisor: "/dashboard",
};

export default function AcceptInvitePage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // When Supabase sends an invite link, it lands here with an access_token in the URL hash.
    // @supabase/ssr detects and stores it automatically. Just wait for getUser() to populate.
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        setError(
          "Invite link missing or expired. Ask your admin to re-send the invitation."
        );
      } else {
        setEmail(data.user.email ?? "");
      }
      setReady(true);
    });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/auth/accept-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error ?? "failed");

      const supabase = createClient();
      const { data: user } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from("users")
        .select("role")
        .eq("id", user.user?.id ?? "")
        .maybeSingle();
      router.replace(roleRoute[profile?.role ?? ""] ?? "/");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Accept invitation</h1>
          <p className="text-slate-400 text-sm mt-1">Set a password and join your team.</p>
        </div>

        {!ready ? (
          <div className="text-center text-slate-500 text-sm">Verifying invite…</div>
        ) : (
          <form
            onSubmit={submit}
            className="space-y-4 rounded-xl border border-slate-700 bg-slate-900/60 p-6"
          >
            <div>
              <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1">
                Your email
              </label>
              <div className="font-mono text-sm text-slate-200 bg-slate-950 rounded-md border border-slate-700 px-3 py-2">
                {email || "—"}
              </div>
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1">
                Choose a password (≥ 8 chars)
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
              />
            </div>
            {error && (
              <div className="rounded border border-rose-700/50 bg-rose-900/20 px-3 py-2 text-sm text-rose-300">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={busy || !email}
              className="w-full rounded-md bg-brand hover:bg-brand/90 px-4 py-2 text-sm font-semibold text-brand-fg disabled:opacity-50"
            >
              {busy ? "Joining…" : "Set password & join"}
            </button>
          </form>
        )}

        <div className="text-center text-sm text-slate-400">
          <Link href="/" className="hover:text-slate-200">
            ← back
          </Link>
        </div>
      </div>
    </main>
  );
}
