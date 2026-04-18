import type { ButtonHTMLAttributes, ReactNode } from "react";

// Butterfly Button — two variants only: accent-filled (primary) and
// accent-outlined (ghost). Per spec: "more than one accent-colored element
// per viewport" is banned, so primary is used sparingly.

type Variant = "primary" | "ghost";
type Size = "md" | "lg" | "xl";

export interface BfButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-[color:var(--bf-accent)] text-white hover:brightness-110 disabled:opacity-40",
  ghost:
    "bg-transparent text-[color:var(--bf-ink)] border border-[color:var(--bf-accent)] hover:bg-[color:var(--bf-accent-light)] disabled:opacity-40",
};

const SIZE: Record<Size, string> = {
  md: "h-11 px-5 text-[15px]",
  lg: "h-14 px-6 text-[17px] font-semibold",
  xl: "h-[72px] px-8 text-[20px] font-semibold", // check-in tap target
};

export function BfButton({
  variant = "primary",
  size = "md",
  leftIcon,
  rightIcon,
  className = "",
  children,
  disabled,
  ...props
}: BfButtonProps) {
  return (
    <button
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-full transition-colors duration-150 disabled:cursor-not-allowed ${VARIANT[variant]} ${SIZE[size]} ${className}`}
      {...props}
    >
      {leftIcon}
      {children}
      {rightIcon}
    </button>
  );
}
