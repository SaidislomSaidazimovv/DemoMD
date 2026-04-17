import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const ROLE_ROUTE: Record<string, string> = {
  admin: "/admin",
  inspector: "/capture",
  bank_officer: "/dashboard",
  supervisor: "/dashboard",
};

export default async function Home() {
  const supabase = createClient();

  // getUser() verifies the token with Supabase Auth. Safer for server-side
  // auth decisions than getSession(), which decodes cookies locally.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Signed-in users skip the marketing page.
  if (user) {
    const { data: profile } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    redirect(profile ? (ROLE_ROUTE[profile.role] ?? "/admin") : "/complete-signup");
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-2xl w-full space-y-8">
        <div>
          <h1 className="text-4xl font-bold">Tasdiq</h1>
          <p className="text-slate-400 mt-2">
            Construction milestone verification for banks — 5-layer fraud detection,
            tamper-evident ledger, realtime dashboard.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Link
            href="/signup"
            className="rounded-lg border border-emerald-600/40 bg-emerald-900/20 hover:bg-emerald-900/30 p-5 transition"
          >
            <div className="text-lg font-semibold text-emerald-200">Create organization →</div>
            <div className="text-xs text-emerald-200/70 mt-1">
              New bank? Sign up here. You become the admin.
            </div>
          </Link>
          <Link
            href="/login"
            className="rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 p-5 transition"
          >
            <div className="text-lg font-semibold">Sign in →</div>
            <div className="text-xs text-slate-400 mt-1">
              Admin, bank officer, supervisor, inspector.
            </div>
          </Link>
        </div>

        <div className="rounded border border-slate-800 bg-slate-900/60 p-4 text-xs text-slate-400 space-y-1.5">
          <p className="text-slate-300 font-semibold">How onboarding works:</p>
          <p>
            <strong className="text-slate-200">1.</strong> A bank admin creates the organization
            on{" "}
            <Link href="/signup" className="underline">
              /signup
            </Link>
            .
          </p>
          <p>
            <strong className="text-slate-200">2.</strong> From{" "}
            <span className="font-mono">/team</span>, the admin invites bank officers and
            inspectors by email. Each gets a magic-link invitation.
          </p>
          <p>
            <strong className="text-slate-200">3.</strong> Inspectors capture evidence on their
            phones at <span className="font-mono">/capture</span>. Bank officers see everything
            live on <span className="font-mono">/dashboard</span>.
          </p>
        </div>
      </div>
    </main>
  );
}
