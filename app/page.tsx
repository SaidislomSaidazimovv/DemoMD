import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Building2,
  Eye,
  FileCheck2,
  LockKeyhole,
  Radio,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PipelineDemo } from "@/components/landing/pipeline-demo";
import { ButterflyDemo } from "@/components/landing/butterfly-demo";

// Per-role landing. Product is the primary routing decision (see below);
// role only matters *within* a product.
const TASDIQ_ROLE_ROUTE: Record<string, string> = {
  admin: "/admin",
  inspector: "/capture",
  bank_officer: "/dashboard",
  supervisor: "/dashboard",
};
const BUTTERFLY_ROLE_ROUTE: Record<string, string> = {
  hr_admin: "/app/home",
  manager: "/app/checkin",
  responder: "/app/checkin",
  // Tasdiq-only roles in a butterfly org would be a misconfiguration —
  // fall back to /app/home.
  admin: "/app/home",
};

export default async function Home() {
  const supabase = createClient();

  // getUser() verifies the token with Supabase Auth. Safer for server-side
  // auth decisions than getSession(), which decodes cookies locally.
  //
  // The result destructures to { user: null, error } when the browser sends
  // an expired refresh cookie. Treat that the same as "not signed in" —
  // middleware already scrubs the stale cookies so this is a one-shot case.
  const { data } = await supabase.auth.getUser();
  const user = data?.user ?? null;

  // Signed-in users skip the marketing page.
  if (user) {
    const { data: profileRow } = await supabase
      .from("users")
      .select("role, organizations(product)")
      .eq("id", user.id)
      .maybeSingle();

    if (!profileRow) {
      redirect("/complete-signup");
    }

    const role = (profileRow as { role?: string }).role ?? "admin";
    const product =
      ((profileRow as { organizations?: { product?: string } | null })
        .organizations?.product as "tasdiq" | "butterfly" | undefined) ??
      "tasdiq";

    if (product === "butterfly") {
      redirect(BUTTERFLY_ROLE_ROUTE[role] ?? "/app/home");
    }
    redirect(TASDIQ_ROLE_ROUTE[role] ?? "/admin");
  }

  return (
    <main className="min-h-screen bg-surface-base text-ink">
      {/* Top bar */}
      <header className="border-b border-hairline-subtle">
        <div className="max-w-6xl mx-auto px-6 sm:px-10 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck size={20} className="text-accent" />
            <span className="text-heading-2 font-semibold tracking-tight">
              Tasdiq + Butterfly
            </span>
          </div>
          <nav className="flex items-center gap-6 text-caption">
            <Link href="/login" className="text-ink-tertiary hover:text-ink">
              Sign in
            </Link>
            <Link
              href="/signup"
              className="rounded-md bg-accent text-[#04130B] px-4 h-9 inline-flex items-center font-medium hover:brightness-110"
            >
              Create workspace
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 sm:px-10 pt-20 sm:pt-28 pb-20 fade-up">
        <div className="max-w-3xl space-y-6">
          <div className="text-micro uppercase text-ink-muted">
            Two products · one tamper-evident platform
          </div>
          <h1 className="text-display text-ink">
            Cryptographic proof for
            <br />
            the records that matter.
          </h1>
          <p className="text-body text-ink-secondary max-w-2xl leading-relaxed">
            Two products that turn phone cameras and 3-tap loggers into
            records you can defend in court. Every entry is cryptographically
            sealed, every audit verifies itself, every change shows up
            immediately. And AI reviews every submission in plain English,
            so reviewers don&apos;t need to read the small print.
          </p>
          <div className="flex items-center gap-3 pt-2">
            <Link
              href="/signup"
              className="rounded-md bg-accent text-[#04130B] px-5 h-11 inline-flex items-center font-semibold hover:brightness-110"
            >
              Create a workspace
            </Link>
            <Link
              href="/login"
              className="text-ink-tertiary hover:text-ink text-body"
            >
              Sign in &rarr;
            </Link>
          </div>
        </div>
      </section>

      {/* Two products */}
      <section className="max-w-6xl mx-auto px-6 sm:px-10 pb-20">
        <div className="text-micro uppercase text-ink-muted mb-6">
          Pick the product you&apos;re here for
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Tasdiq card */}
          <Link
            href="/signup?product=tasdiq"
            className="group rounded-xl border border-hairline-subtle bg-surface-card hover:border-hairline-strong p-8 transition-colors duration-base"
          >
            <div className="flex items-start justify-between">
              <div className="rounded-md bg-state-verified-bg text-state-verified p-2.5">
                <Building2 size={22} />
              </div>
              <span className="text-micro uppercase text-ink-muted">
                For banks
              </span>
            </div>
            <h2 className="mt-6 text-heading-1 text-ink">Tasdiq</h2>
            <p className="mt-2 text-body text-ink-secondary leading-relaxed">
              Construction-milestone verification for banks that release
              loans in stages. Six automatic checks, a sealed audit trail,
              and legally-ready export packs. Stop paying against photos
              that could be anything.
            </p>
            <ul className="mt-6 space-y-2 text-caption text-ink-tertiary">
              <Bullet>
                Six checks per capture — location, hand motion, screen-replay,
                duplicates, one-time code, AI visual review
              </Bullet>
              <Bullet>
                Bank officer sees verified or flagged evidence within two
                seconds of the inspector pressing submit
              </Bullet>
              <Bullet>
                One-click download of a PDF act, all evidence, and a sealed
                audit trail ready for regulators
              </Bullet>
            </ul>
            <div className="mt-6 text-caption text-accent inline-flex items-center gap-1 group-hover:gap-2 transition-all">
              Create a Tasdiq workspace &rarr;
            </div>
          </Link>

          {/* Butterfly card */}
          <Link
            href="/signup?product=butterfly"
            className="group rounded-xl border border-hairline-subtle bg-surface-card hover:border-hairline-strong p-8 transition-colors duration-base"
          >
            <div className="flex items-start justify-between">
              <div className="rounded-md bg-state-info-bg text-state-info p-2.5">
                <Sparkles size={22} />
              </div>
              <span className="text-micro uppercase text-ink-muted">
                For HR & compliance
              </span>
            </div>
            <h2 className="mt-6 text-heading-1 text-ink">Butterfly</h2>
            <p className="mt-2 text-body text-ink-secondary leading-relaxed">
              Anonymous check-in logging for mental-health and workplace-
              wellness moments. Three taps, no names, everything deletes
              itself after 90 days. Proof to the board without the legal
              exposure of a traditional HR file.
            </p>
            <ul className="mt-6 space-y-2 text-caption text-ink-tertiary">
              <Bullet>
                Counts only, never names. No descriptions, no health details,
                no identifiable information — ever
              </Bullet>
              <Bullet>
                Quarterly PDF that reads like an annual report, covering
                OSHA, ADA, HIPAA, and EPLI posture
              </Bullet>
              <Bullet>
                Individual records delete themselves after 90 days. Only the
                totals carry forward.
              </Bullet>
            </ul>
            <div className="mt-6 text-caption text-state-info inline-flex items-center gap-1 group-hover:gap-2 transition-all">
              Create a Butterfly workspace &rarr;
            </div>
          </Link>
        </div>
      </section>

      {/* Interactive pipeline demo */}
      <section className="border-t border-hairline-subtle">
        <div className="max-w-6xl mx-auto px-6 sm:px-10 py-20">
          <div className="max-w-2xl mb-10">
            <div className="text-micro uppercase text-ink-muted mb-3">
              See how verification works
            </div>
            <h2 className="text-heading-1 text-ink">
              Six checks run on every capture.
              <br />
              <span className="text-ink-tertiary">
                Watch them catch a fake one live.
              </span>
            </h2>
            <p className="mt-4 text-body text-ink-secondary leading-relaxed">
              The panel below walks through Tasdiq&apos;s six checks on a
              simulated capture. It alternates between a genuine site visit
              (everything passes) and a screen-replay attempt (everything
              fails). You can pause it, jump to any check, or flip the
              scenario.
            </p>
          </div>
          <PipelineDemo />
        </div>
      </section>

      {/* Butterfly explainer — contemplative opposite of the pipeline */}
      <section className="border-t border-hairline-subtle bg-surface-subtle/30">
        <div className="max-w-6xl mx-auto px-6 sm:px-10 py-20">
          <div className="max-w-2xl mb-10">
            <div className="text-micro uppercase text-ink-muted mb-3">
              Butterfly — a different kind of record
            </div>
            <h2 className="text-heading-1 text-ink">
              Tasdiq catches the bad actor.
              <br />
              <span className="text-ink-tertiary">
                Butterfly never learns who anyone is.
              </span>
            </h2>
            <p className="mt-4 text-body text-ink-secondary leading-relaxed">
              Same platform, opposite data philosophy. Tasdiq keeps every
              record forever so fraud can&apos;t hide. Butterfly keeps
              almost nothing — on purpose — so employees can&apos;t be
              exposed by their own HR log.
            </p>
          </div>
          <ButterflyDemo />
        </div>
      </section>

      {/* Shared foundation */}
      <section className="border-t border-hairline-subtle bg-surface-subtle/40">
        <div className="max-w-6xl mx-auto px-6 sm:px-10 py-20">
          <div className="max-w-2xl mb-12">
            <div className="text-micro uppercase text-ink-muted mb-3">
              The foundation, both products share
            </div>
            <h2 className="text-heading-1 text-ink">
              Four guarantees that every record on this platform inherits.
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FeatureCard
              icon={<LockKeyhole className="text-accent" size={20} />}
              title="Tamper-evident by design"
              description="Every entry is cryptographically linked to the one before it. Change a single byte after the fact and the seal breaks — anyone verifying the record can see it. Exported packs carry their own seal, so a regulator or lawyer can verify them offline without ever talking to us."
            />
            <FeatureCard
              icon={<Radio className="text-accent" size={20} />}
              title="Real-time, no refresh"
              description="An inspector submits on their phone. The bank officer&apos;s laptop updates within two seconds. A manager taps three buttons. The HR dashboard&apos;s count ticks up immediately. No page refresh, no waiting."
            />
            <FeatureCard
              icon={<Eye className="text-accent" size={20} />}
              title="AI that does real work"
              description="Google&apos;s Gemini reviews every Tasdiq capture and asks the question a human reviewer would: does the photo actually match the claimed milestone? When something looks wrong, it writes a two-sentence explanation the bank officer reads in seconds. Not decoration."
            />
            <FeatureCard
              icon={<FileCheck2 className="text-accent" size={20} />}
              title="Legal-grade output"
              description="Tasdiq export packs are structured for banking regulators and (soon) digitally signed via Uzbekistan&apos;s E-IMZO system for court admissibility. Butterfly quarterly reports include OSHA, ADA, HIPAA, and EPLI posture analysis. Hand either to your lawyer and every record is verifiable."
            />
          </div>
        </div>
      </section>

      {/* Who uses this */}
      <section className="max-w-6xl mx-auto px-6 sm:px-10 py-20">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          <div>
            <div className="text-micro uppercase text-ink-muted mb-3">
              Tasdiq is for
            </div>
            <h3 className="text-heading-2 text-ink mb-4">
              Banks financing construction loans
            </h3>
            <div className="space-y-3 text-body text-ink-secondary leading-relaxed">
              <p>
                <strong className="text-ink">The problem:</strong> before each
                tranche is released, someone must prove the milestone happened.
                Today that&apos;s a human with a clipboard who can be bribed.
              </p>
              <p>
                <strong className="text-ink">With Tasdiq:</strong> an inspector
                records 15 seconds of video on their phone. Six automatic checks
                run in the background. The bank officer sees verified or flagged
                evidence within two seconds. When something looks wrong, an AI
                summary explains exactly what.
              </p>
              <p>
                <strong className="text-ink">Target customers:</strong> NBU,
                Ipoteka, Asaka, and other national and regional banks in
                Uzbekistan. Central Asia expansion planned.
              </p>
            </div>
          </div>
          <div>
            <div className="text-micro uppercase text-ink-muted mb-3">
              Butterfly is for
            </div>
            <h3 className="text-heading-2 text-ink mb-4">
              Companies, schools, agencies with employees
            </h3>
            <div className="space-y-3 text-body text-ink-secondary leading-relaxed">
              <p>
                <strong className="text-ink">The problem:</strong> when an
                employee is struggling, managers want to help — but the moment
                HR writes down who and what, the company acquires permanent
                legal liability.
              </p>
              <p>
                <strong className="text-ink">With Butterfly:</strong> managers
                log a three-tap check-in — no names, no descriptions, just
                which resource was offered and whether it was accepted. HR
                sees the aggregate trend. Quarterly reports prove compliance
                to the board without ever revealing an individual. Records
                delete themselves after 90 days.
              </p>
              <p>
                <strong className="text-ink">Target customers:</strong> Fortune
                500 HR departments, school districts, government agencies,
                healthcare systems.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-hairline-subtle">
        <div className="max-w-4xl mx-auto px-6 sm:px-10 py-20 text-center space-y-6">
          <h2 className="text-heading-1 text-ink">Ready to see it?</h2>
          <p className="text-body text-ink-secondary max-w-xl mx-auto">
            Create a workspace in under a minute. The built-in simulators let
            you walk through the fraud-detection moment without
            needing a real construction site or live check-in.
          </p>
          <div className="flex items-center justify-center gap-3 pt-2">
            <Link
              href="/signup"
              className="rounded-md bg-accent text-[#04130B] px-5 h-11 inline-flex items-center font-semibold hover:brightness-110"
            >
              Create a workspace
            </Link>
            <Link
              href="/login"
              className="text-ink-tertiary hover:text-ink text-body"
            >
              Sign in &rarr;
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-hairline-subtle">
        <div className="max-w-6xl mx-auto px-6 sm:px-10 py-10 flex items-center justify-between text-caption text-ink-muted">
          <div className="flex items-center gap-2">
            <ShieldCheck size={14} />
            <span>Tasdiq + Butterfly</span>
          </div>
          <div className="flex items-center gap-6">
            <span>Tashkent · {new Date().getFullYear()}</span>
          </div>
        </div>
      </footer>
    </main>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span className="text-accent mt-1 shrink-0">&bull;</span>
      <span>{children}</span>
    </li>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-hairline-subtle bg-surface-card p-6">
      <div className="rounded-md bg-accent/10 inline-flex p-2">{icon}</div>
      <h3 className="mt-4 text-heading-2 text-ink">{title}</h3>
      <p className="mt-2 text-caption text-ink-tertiary leading-relaxed">
        {description}
      </p>
    </div>
  );
}

