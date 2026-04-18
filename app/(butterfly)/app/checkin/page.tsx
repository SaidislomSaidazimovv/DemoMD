"use client";

import Link from "next/link";
import { useState } from "react";
import { Check } from "lucide-react";
import { CheckinButton, BfButton } from "@/components/butterfly/ui";
import { useBfSession } from "@/components/butterfly/app-shell";
import { logButterflyCheckin } from "@/lib/actions";

// Check-in logger. Per BUTTERFLY_SAAS_UI.md §"The check-in logger":
// Three screens, three taps, under 10 seconds total. Full-width tap
// targets (72px). No history, no names, no descriptions.

type Step = "tap1" | "tap2" | "tap3" | "done";
type Routing = "988" | "eap" | "counselor" | "self_resolved" | "declined";

const ROUTING_OPTIONS: { value: Routing; label: string }[] = [
  { value: "988", label: "Called 988 together" },
  { value: "eap", label: "Referred to EAP" },
  { value: "counselor", label: "Connected with counselor" },
  { value: "self_resolved", label: "Self-resolved — a moment" },
  { value: "declined", label: "Declined all support" },
];

export default function ButterflyCheckinPage() {
  useBfSession();
  const [step, setStep] = useState<Step>("tap1");
  const [routing, setRouting] = useState<Routing | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setStep("tap1");
    setRouting(null);
    setError(null);
  }

  async function submit(accepted: boolean) {
    if (!routing) return;
    setBusy(true);
    setError(null);
    try {
      await logButterflyCheckin({ routing_type: routing, accepted });
      setStep("done");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bf-fade-in min-h-[80vh] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-md">
        {step === "tap1" && (
          <div className="space-y-10 text-center">
            <div className="text-[15px] text-[color:var(--bf-caption)]">
              No names. No details. Just a count.
            </div>
            <CheckinButton
              variant="primary"
              onClick={() => setStep("tap2")}
              className="text-[22px]"
            >
              Log a check-in
            </CheckinButton>
          </div>
        )}

        {step === "tap2" && (
          <div className="space-y-6">
            <h2 className="text-[24px] font-semibold text-center text-[color:var(--bf-ink)] tracking-tight">
              How was the person routed?
            </h2>
            <div className="space-y-3">
              {ROUTING_OPTIONS.map((opt) => (
                <CheckinButton
                  key={opt.value}
                  onClick={() => {
                    setRouting(opt.value);
                    setStep("tap3");
                  }}
                >
                  {opt.label}
                </CheckinButton>
              ))}
            </div>
            <div className="text-center pt-2">
              <button
                onClick={reset}
                className="text-[14px] text-[color:var(--bf-caption)] hover:text-[color:var(--bf-ink)] transition-colors"
              >
                ← back
              </button>
            </div>
          </div>
        )}

        {step === "tap3" && (
          <div className="space-y-6">
            <h2 className="text-[24px] font-semibold text-center text-[color:var(--bf-ink)] tracking-tight">
              Did they accept the resource?
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <CheckinButton
                variant="primary"
                onClick={() => submit(true)}
                disabled={busy}
              >
                {busy ? "…" : "Yes"}
              </CheckinButton>
              <CheckinButton onClick={() => submit(false)} disabled={busy}>
                {busy ? "…" : "No"}
              </CheckinButton>
            </div>
            {error && (
              <div className="text-center text-[14px] text-[color:var(--bf-flagged)]">
                {error}
              </div>
            )}
            <div className="text-center pt-2">
              <button
                onClick={() => setStep("tap2")}
                disabled={busy}
                className="text-[14px] text-[color:var(--bf-caption)] hover:text-[color:var(--bf-ink)] transition-colors disabled:opacity-40"
              >
                ← back
              </button>
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="space-y-8 text-center">
            <div className="mx-auto w-20 h-20 rounded-full bg-[color:var(--bf-accent-light)] flex items-center justify-center">
              <Check size={40} className="text-[color:var(--bf-accent)]" />
            </div>
            <div>
              <h2 className="text-[28px] font-semibold text-[color:var(--bf-ink)] tracking-tight">
                Check-in logged.
              </h2>
              <p className="mt-3 text-[18px] text-[color:var(--bf-muted)]">
                Thank you for showing up.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3">
              <BfButton variant="ghost" onClick={reset}>
                Log another
              </BfButton>
              <Link href="/app/home">
                <BfButton variant="primary">Done</BfButton>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
