import type { HTMLAttributes, ReactNode } from "react";

// Per TASDIQ_UI_REDESIGN.md: surface-card bg, hairline border, rounded-lg, 24px padding.

export function Card({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-lg border border-hairline-subtle bg-surface-card transition-colors duration-base hover:border-hairline-strong ${className}`}
      {...props}
    />
  );
}

export function CardHeader({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={`px-6 pt-6 pb-3 ${className}`} {...props} />;
}

export function CardTitle({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h3 className={`text-heading-2 text-ink ${className}`}>{children}</h3>
  );
}

export function CardDescription({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={`text-caption text-ink-tertiary mt-1 ${className}`}>{children}</p>
  );
}

export function CardContent({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={`px-6 pb-6 ${className}`} {...props} />;
}

export function CardFooter({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`px-6 py-4 border-t border-hairline-subtle ${className}`}
      {...props}
    />
  );
}
