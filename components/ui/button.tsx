import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  loading?: boolean;
}

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-accent text-[#04130B] hover:brightness-110 disabled:bg-accent/40 disabled:text-ink-muted",
  secondary:
    "bg-surface-elevated text-ink hover:bg-surface-card border border-hairline-strong disabled:text-ink-muted",
  ghost:
    "bg-transparent text-ink-secondary hover:bg-surface-elevated hover:text-ink disabled:text-ink-muted",
  danger:
    "bg-state-flagged text-white hover:brightness-110 disabled:bg-state-flagged/40",
};

const SIZE: Record<Size, string> = {
  sm: "h-8 px-3 text-caption",
  md: "h-10 px-4 text-body",
  lg: "h-12 px-5 text-body font-semibold",
};

export function Button({
  variant = "secondary",
  size = "md",
  leftIcon,
  rightIcon,
  loading,
  disabled,
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-md font-medium transition-all duration-fast disabled:cursor-not-allowed ${VARIANT[variant]} ${SIZE[size]} ${className}`}
      {...props}
    >
      {loading ? (
        <span className="inline-block h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
      ) : (
        leftIcon
      )}
      {children}
      {!loading && rightIcon}
    </button>
  );
}
