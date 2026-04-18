import type { ButtonHTMLAttributes } from "react";

// CheckinButton — full-width 72px tap target for the 3-tap logger.
// Primary variant: accent blue fill (Screen: Tap 1).
// Option variant: white with hairline border (Screens: Tap 2, Tap 3).

type Variant = "primary" | "option";

export function CheckinButton({
  variant = "option",
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const base =
    "w-full h-[72px] px-6 text-[18px] font-medium rounded-full transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed";
  const styled =
    variant === "primary"
      ? "bg-[color:var(--bf-accent)] text-white hover:brightness-110"
      : "bg-[color:var(--bf-bg)] text-[color:var(--bf-ink)] border border-[color:var(--bf-hair)] hover:border-[color:var(--bf-accent)] hover:bg-[color:var(--bf-accent-light)]";
  return (
    <button className={`${base} ${styled} ${className}`} {...props}>
      {children}
    </button>
  );
}
