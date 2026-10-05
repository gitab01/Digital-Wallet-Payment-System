"use client";

import { formatAmount } from "@/lib/money";
import type { CurrencyCode, Money } from "@/lib/types";

/**
 * The only way money reaches the screen. Renders the digits with
 * `tabular-nums` so columns of amounts line up, and shows the currency as a
 * code rather than a symbol — "ETB" is unambiguous, "Br" is not always.
 */
export function Amount({
  value,
  currency,
  size = "md",
  signed,
  tone = "neutral",
  className = "",
}: {
  value: Money | null | undefined;
  currency: CurrencyCode | null | undefined;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  /** Force a leading + or - (used for IN/OUT rows). */
  signed?: "+" | "-" | "none";
  tone?: "neutral" | "positive" | "negative" | "faint";
  className?: string;
}) {
  const formatted = formatAmount(value, currency);

  const sizes: Record<typeof size, string> = {
    xs: "text-label",
    sm: "text-body",
    md: "text-title",
    lg: "text-h2",
    xl: "text-h1",
  };

  const tones: Record<typeof tone, string> = {
    neutral: "text-ink",
    positive: "text-accent",
    negative: "text-debit",
    faint: "text-ink-faint",
  };

  if (!formatted) {
    return <span className={`num ${tones.faint} ${className}`.trim()}>—</span>;
  }

  const negative = formatted.negative || signed === "-";
  const prefix = signed === "+" ? "+" : negative ? "-" : "";

  return (
    <span
      className={`num inline-flex items-baseline gap-1 whitespace-nowrap ${sizes[size]} ${tones[tone]} ${className}`.trim()}
    >
      <span>
        {prefix}
        {formatted.value}
      </span>
      {formatted.currency ? (
        <span className="text-label font-medium uppercase tracking-wide text-ink-faint">
          {formatted.currency}
        </span>
      ) : null}
    </span>
  );
}

/** "2.50" with no currency decoration — for table cells that carry a header. */
export function AmountBare({
  value,
  tone = "neutral",
  className = "",
}: {
  value: Money | null | undefined;
  tone?: "neutral" | "positive" | "negative" | "faint";
  className?: string;
}) {
  const formatted = formatAmount(value, null);
  const tones: Record<string, string> = {
    neutral: "text-ink",
    positive: "text-accent",
    negative: "text-debit",
    faint: "text-ink-faint",
  };
  if (!formatted) return <span className={`num ${tones.faint}`}>—</span>;
  return <span className={`num ${tones[tone]} ${className}`}>{formatted.signed}</span>;
}
