"use client";

import type { ReactNode } from "react";

import { formatDateTime } from "@/lib/money";
import type { TransactionStatus, WalletAccount } from "@/lib/types";

type Tone = "neutral" | "positive" | "negative" | "muted";

const TONES: Record<Tone, string> = {
  neutral: "border-ink text-ink",
  positive: "border-accent text-accent",
  negative: "border-debit text-debit",
  muted: "border-line text-ink-faint",
};

export function Chip({
  tone = "muted",
  children,
  title,
  className = "",
}: {
  tone?: Tone;
  children: ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <span title={title} className={`chip ${TONES[tone]} ${className}`.trim()}>
      {children}
    </span>
  );
}

const STATUS_TONE: Record<string, Tone> = {
  COMPLETED: "positive",
  PENDING: "muted",
  FAILED: "negative",
  REVERSED: "negative",
  REVIEW: "negative",
};

export function StatusChip({ status }: { status: TransactionStatus }) {
  const tone = STATUS_TONE[status] ?? "muted";
  return <Chip tone={tone}>{status ? status.replace(/_/g, " ") : "Unknown"}</Chip>;
}

/**
 * `reconciled` is the contract's proof that this account's projection was last
 * checked against the ledger — that is what "verified" means here, nothing more.
 */
export function VerifiedChip({ account }: { account: Pick<WalletAccount, "reconciled" | "verifiedAt"> }) {
  if (account.reconciled) {
    return (
      <Chip
        tone="positive"
        title={
          account.verifiedAt
            ? `Balance proved against the ledger at ${formatDateTime(account.verifiedAt)}`
            : "Balance proved against the ledger"
        }
      >
        <Dot tone="positive" />
        Verified
      </Chip>
    );
  }
  return (
    <Chip
      tone="muted"
      title={
        account.verifiedAt
          ? `Last proved against the ledger at ${formatDateTime(account.verifiedAt)}`
          : "Not yet proved against the ledger"
      }
    >
      <Dot tone="muted" />
      Not verified
    </Chip>
  );
}

export function ReviewChip({ flagged }: { flagged: boolean }) {
  if (!flagged) return null;
  return (
    <Chip tone="negative" title="This movement was flagged by the anomaly rules and is under review">
      Under review
    </Chip>
  );
}

export function Dot({ tone = "muted" }: { tone?: Tone }) {
  const bg =
    tone === "positive" ? "bg-accent" : tone === "negative" ? "bg-debit" : tone === "neutral" ? "bg-ink" : "bg-ink-faint/40";
  return <span aria-hidden="true" className={`inline-block h-1.5 w-1.5 rounded-full ${bg}`} />;
}
