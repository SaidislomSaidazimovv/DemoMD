import type { HTMLAttributes, ReactNode } from "react";

// Butterfly Card — white surface, hair-thin border, generous padding.
// No dark mode. No shadows. No rounded corners beyond the institutional
// `--bf-radius` on the outer card.

export function BfCard({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`bg-[color:var(--bf-bg)] border border-[color:var(--bf-hair)] rounded-[28px] ${className}`}
      {...props}
    />
  );
}

export function BfCardHeader({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={`px-8 pt-8 pb-4 ${className}`} {...props} />;
}

export function BfCardTitle({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h3 className={`text-[color:var(--bf-ink)] font-semibold text-[28px] leading-tight tracking-tight ${className}`}>
      {children}
    </h3>
  );
}

export function BfCardContent({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={`px-8 pb-8 ${className}`} {...props} />;
}
