import type { ReactNode } from "react";

// Per spec: illustrated empty state with icon + copy + primary CTA.
// Use for "no projects yet", "no evidence uploaded", "no flagged items" etc.

export function EmptyState({
  icon,
  title,
  description,
  action,
  className = "",
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center rounded-lg border border-dashed border-hairline-strong bg-surface-subtle/50 px-6 py-16 ${className}`}
    >
      <div className="text-ink-muted mb-4 [&>svg]:h-12 [&>svg]:w-12">
        {icon}
      </div>
      <h3 className="text-heading-2 text-ink">{title}</h3>
      {description && (
        <p className="text-body text-ink-tertiary mt-2 max-w-md">{description}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
