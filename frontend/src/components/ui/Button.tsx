"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-ink text-white border border-ink hover:bg-white hover:text-ink",
  secondary: "bg-white text-ink border border-ink hover:bg-ink hover:text-white",
  ghost: "bg-white text-ink border border-transparent hover:border-line",
  danger: "bg-white text-debit border border-debit hover:bg-debit hover:text-white",
};

const SIZES: Record<Size, string> = {
  sm: "h-9 px-3 text-label",
  md: "h-11 px-4 text-body",
  lg: "h-12 px-5 text-body",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Full width on mobile — every primary action is thumb-reachable. */
  block?: boolean;
  loading?: boolean;
  trailing?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    block = false,
    loading = false,
    trailing,
    className = "",
    children,
    disabled,
    type = "button",
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={[
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-medium uppercase tracking-wide transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-40",
        VARIANTS[variant],
        SIZES[size],
        // Full width while the row is stacked; from the small breakpoint up the action
        // row is a flex row, where "w-full" alone would overflow the panel it sits in.
        block ? "w-full min-w-0 sm:grow sm:basis-0" : "",
        className,
      ].join(" ")}
      {...rest}
    >
      {loading ? <Spinner className="h-4 w-4" /> : null}
      {children}
      {trailing}
    </button>
  );
});

export function Spinner({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={[
        "inline-block animate-spin rounded-full border-2 border-current border-t-transparent align-[-2px]",
        className,
      ].join(" ")}
    />
  );
}
