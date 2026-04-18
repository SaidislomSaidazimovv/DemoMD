"use client";

import { PrivacyComparison } from "@/components/butterfly/ui";
import { useBfSession } from "@/components/butterfly/app-shell";

// Screen 4 — Privacy.
// The screen that closes General Counsel. Side-by-side comparison of
// what we track vs. what we never see. Pure institutional tone.

export default function ButterflyPrivacyPage() {
  // Session is already resolved by the shell; just ensure we're inside it.
  useBfSession();

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
