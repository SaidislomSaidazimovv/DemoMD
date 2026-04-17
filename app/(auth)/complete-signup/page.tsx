"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

// Lands here after OAuth (typically Google) if the user has no profile + no invite.
// They're already signed in; they just need to tell us what organization to create.

export default function CompleteSignupPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace("/login");
        return;
      }
      setEmail(data.user.email ?? "");
      setFullName(
        (data.user.user_metadata?.full_name as string) ??
          (data.user.user_metadata?.name as string) ??
          ""
      );
      setReady(true);
    });
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/auth/complete-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ fullName, orgName, orgSlug }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? "failed");
      router.replace("/admin");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  function suggestSlug(name: string) {
    const s = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50);
    if (!orgSlug) setOrgSlug(s);
  }

  if (!ready) {
    return <main className="min-h-screen flex items-center justify-center text-slate-500">Loading…</main>;
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Finish signing up</h1>
          <p className="text-slate-400 text-sm mt-1">
            Signed in as <span className="font-mono text-slate-200">{email}</span>. Now tell us
            about your organization.
          </p>
        </div>

        <form
          onSubmit={submit}
          className="space-y-4 rounded-xl border border-slate-700 bg-slate-900/60 p-6"
        >
          <div>
            <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1">Full name</label>
            <input
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1">Bank / organization name</label>
            <input
              required
              value={orgName}
              onChange={(e) => {
                setOrgName(e.target.value);
                suggestSlug(e.target.value);
              }}
              className="input"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1">URL slug</label>
            <input
              required
              pattern="[a-z0-9\-]{3,50}"
              value={orgSlug}
              onChange={(e) => setOrgSlug(e.target.value)}
              className="input font-mono"
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
            {busy ? "Creating…" : "Create organization"}
          </button>
        </form>

        <div className="text-center text-sm text-slate-400">
          <Link href="/login" className="hover:text-slate-200">
            ← back
          </Link>
        </div>
      </div>

      <style jsx>{`
        :global(.input) {
          width: 100%;
          border-radius: 0.375rem;
          border: 1px solid rgb(51 65 85);
          background: rgb(2 6 23);
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
        }
      `}</style>
    </main>
  );
}
