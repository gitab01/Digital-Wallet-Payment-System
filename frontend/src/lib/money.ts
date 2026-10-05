import type { CurrencyCode, IsoDate, IsoDateTime, Money } from "./types";

/**
 * Money helpers. Everything here is string / BigInt based: there is no code path
 * in this client that does arithmetic on a floating point representation of a
 * currency amount.
 */

/** What a user may type mid-edit. */
export const AMOUNT_INPUT_RE = /^\d{1,12}(?:\.\d{0,2})?$/;

/**
 * Turn user input into the wire format — unsigned, up to 12 integer digits and
 * exactly two decimals ("25" -> "25.00") — or null if it is not a usable amount.
 * Purely lexical: no float is involved.
 */
export function toWireAmount(raw: string): Money | null {
  const trimmed = raw.trim();
  if (!AMOUNT_INPUT_RE.test(trimmed)) return null;
  const [intPart, decPart = ""] = trimmed.split(".");
  const decimals = (decPart + "00").slice(0, 2);
  const normalised = `${intPart.replace(/^0+(?=\d)/, "")}.${decimals}`;
  if (centsOf(normalised) === 0n) return null;
  return normalised;
}

/** Exact integer cents. Returns null when the string is not money-shaped. */
export function centsOf(value: Money | string | null | undefined): bigint | null {
  if (typeof value !== "string") return null;
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const [, sign, whole, frac = ""] = match;
  const cents = BigInt(whole) * 100n + BigInt((frac + "00").slice(0, 2));
  return sign === "-" ? -cents : cents;
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export interface FormattedAmount {
  /** "1,500.00" — no currency, no sign. */
  value: string;
  /** "-1,500.00" when the amount is negative. */
  signed: string;
  currency: string;
  negative: boolean;
}

/**
 * Format for display only. Unknown/missing amounts render as an em dash rather
 * than a fabricated 0.00.
 */
export function formatAmount(
  amount: Money | null | undefined,
  currency: CurrencyCode | null | undefined,
): FormattedAmount | null {
  if (typeof amount !== "string") return null;
  const cents = centsOf(amount);
  if (cents === null) return null;
  const negative = cents < 0n;
  const absolute = (negative ? -cents : cents).toString();
  const whole = absolute.slice(0, -2) || "0";
  const frac = absolute.slice(-2);
  const value = `${groupThousands(whole)}.${frac}`;
  return {
    value,
    signed: negative ? `-${value}` : value,
    currency: (currency ?? "").toUpperCase(),
    negative,
  };
}

/** Same as formatAmount but never returns null — used where a cell must exist. */
export function formatAmountOrDash(
  amount: Money | null | undefined,
  currency: CurrencyCode | null | undefined,
): string {
  const formatted = formatAmount(amount, currency);
  return formatted ? `${formatted.signed} ${formatted.currency}` : "—";
}

/**
 * Ratio between two money strings, 0..1, for progress bars only. Uses exact
 * cents, so it is a display computation, not a ledger one.
 */
export function ratioOf(part: Money, whole: Money): number | null {
  const p = centsOf(part);
  const w = centsOf(whole);
  if (p === null || w === null || w <= 0n) return null;
  const ratio = Number((p * 10_000n) / w) / 10_000;
  return Math.min(1, Math.max(0, ratio));
}

/* ------------------------------------------------------------- formatting -- */

const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const clockFormatter = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

/** Timestamps are UTC on the wire; we display them as UTC and say so once. */
export function formatDateTime(value: IsoDateTime | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${dateTimeFormatter.format(date)} UTC`;
}

export function formatDate(value: IsoDateTime | IsoDate | null | undefined): string {
  if (!value) return "—";
  const normalised = value.length === 10 ? `${value}T00:00:00Z` : value;
  const date = new Date(normalised);
  if (Number.isNaN(date.getTime())) return value;
  return dateFormatter.format(date);
}

export function formatClock(date: Date | null | undefined): string {
  if (!date) return "—";
  return clockFormatter.format(date);
}

export function formatRelative(value: IsoDateTime | null | undefined): string {
  if (!value) return "—";
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return value;
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 45) return "just now";
  if (seconds < 90) return "1 min ago";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return formatDate(value);
}

/** Today as yyyy-mm-dd, for date input defaults. */
export function todayIso(): IsoDate {
  return new Date().toISOString().slice(0, 10);
}

export function firstOfMonthIso(): IsoDate {
  return `${todayIso().slice(0, 7)}-01`;
}

export function shortRef(value: string, head = 8, tail = 4): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

/** RFC-4122 id with a fallback for non-secure contexts. */
export function uuid(): string {
  const c: Crypto | undefined = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  if (c && typeof c.getRandomValues === "function") {
    const bytes = c.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  throw new Error("No cryptographic random source available for the idempotency key");
}
