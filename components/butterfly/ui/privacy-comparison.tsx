import { Check, X } from "lucide-react";
import type { ReactNode } from "react";

// PrivacyComparison — the two-column checkmark/X layout for Screen 4.
// Left column: what the Butterfly protocol tracks.
// Right column: what it never sees.

export function PrivacyComparison({
  title,
  track,
  never,
  footer,
}: {
  title: string;
  track: string[];
  never: string[];
  footer?: ReactNode;
}) {
  return (
    <section className="max-w-5xl mx-auto">
      <h2 className="text-center text-[color:var(--bf-ink)] font-semibold text-[32px] sm:text-[44px] tracking-tight mb-16">
        {title}
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
        <Column
          heading="We track"
          items={track}
          tone="verified"
          footer="Stored for 90 days. Then auto-purged."
        />
        <Column
          heading="We never see"
          items={never}
          tone="flagged"
          footer="Never recorded. Never reconstructable."
        />
      </div>

      {footer && (
        <div className="max-w-[70ch] mx-auto mt-16 text-[color:var(--bf-muted)] text-[18px] leading-[1.6]">
          {footer}
        </div>
      )}
    </section>
  );
}

function Column({
  heading,
  items,
  tone,
  footer,
}: {
  heading: string;
  items: string[];
  tone: "verified" | "flagged";
  footer: string;
}) {
  const iconClass =
    tone === "verified"
      ? "text-[color:var(--bf-verified)]"
      : "text-[color:var(--bf-flagged)]";
  const Icon = tone === "verified" ? Check : X;

  return (
    <div>
      <div className="text-[13px] uppercase tracking-[0.14em] text-[color:var(--bf-caption)] font-semibold mb-6">
        {heading}
      </div>
      <ul className="space-y-4">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-3 text-[18px] text-[color:var(--bf-ink)]">
            <Icon size={22} className={`mt-0.5 shrink-0 ${iconClass}`} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
      <div className="mt-8 pt-6 border-t border-[color:var(--bf-hair)] text-[15px] text-[color:var(--bf-caption)]">
        {footer}
      </div>
    </div>
  );
}
