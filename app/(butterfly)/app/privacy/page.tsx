"use client";

import { PrivacyComparison } from "@/components/butterfly/ui";
import { useRequireRole } from "@/lib/hooks";

// Screen 4 — Privacy.
// The screen that closes General Counsel. Side-by-side comparison of
// what we track vs. what we never see. Pure institutional tone.

export default function ButterflyPrivacyPage() {
  const { session, loading } = useRequireRole(["hr_admin", "manager", "responder", "admin"]);

  if (loading || !session) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-[color:var(--bf-caption)]">
        Loading…
      </div>
    );
  }

  return (
    <div className="bf-fade-in px-6 sm:px-10 py-24">
      <PrivacyComparison
        title="Your data. Our boundaries."
        track={[
          "Check-in count",
          "Routing type",
          "Acceptance rate",
          "Training completion",
          "Quarterly aggregates",
        ]}
        never={[
          "Names",
          "Situations",
          "Health data",
          "Performance data",
          "Disciplinary links",
        ]}
        footer={
          <p className="leading-[1.7]">
            The Butterfly Protocol is a behavioral response framework, not a medical device.
            We log what happened at the aggregate level, never what was said or who said it.
            This is how it stays safe to use — and why EAP utilization goes up, not down,
            when organizations deploy it.
          </p>
        }
      />
    </div>
  );
}
