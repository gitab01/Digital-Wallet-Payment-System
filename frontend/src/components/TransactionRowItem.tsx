"use client";

import Link from "next/link";

import { Amount } from "@/components/ui/Amount";
import { Icon } from "@/components/ui/Icon";
import { ReviewChip, StatusChip } from "@/components/ui/Chip";
import { formatRelative, shortRef } from "@/lib/money";
import type { TransactionRow } from "@/lib/types";

/** One movement, as a row. Used by the home activity list and /history. */
export function TransactionRowItem({
  row,
  showReference = true,
}: {
  row: TransactionRow;
  showReference?: boolean;
}) {
  const incoming = row.direction === "IN";
  const label = row.counterparty?.trim() || typeLabel(row);

  return (
    <li>
      <Link
        href={`/transactions/${encodeURIComponent(row.reference)}`}
        className="flex items-center gap-3 border-b border-line px-4 py-3.5 hover:border-b-ink sm:px-5"
      >
        <span
          aria-hidden="true"
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${
            incoming ? "border-accent text-accent" : "border-line text-ink-muted"
          }`}
        >
          <Icon name={incoming ? "arrowDownLeft" : "arrowUpRight"} className="h-4 w-4" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-body font-medium text-ink">{label}</span>
            <span className="shrink-0 text-label uppercase tracking-wide text-ink-faint">
              {typeLabel(row)}
            </span>
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="num text-label text-ink-faint">{formatRelative(row.occurredAt)}</span>
            {showReference ? (
              <span className="font-mono text-label text-ink-faint">{shortRef(row.reference)}</span>
            ) : null}
            <ReviewChip flagged={row.reviewFlag} />
          </span>
        </span>

        <span className="flex shrink-0 flex-col items-end gap-1">
          <Amount
            value={row.amount}
            currency={row.currency}
            size="sm"
            signed={incoming ? "+" : "-"}
            tone={incoming ? "positive" : "negative"}
          />
          <StatusChip status={row.status} />
        </span>
      </Link>
    </li>
  );
}

function typeLabel(row: TransactionRow): string {
  switch (row.type) {
    case "TRANSFER":
      return row.direction === "IN" ? "Transfer in" : "Transfer out";
    case "DEPOSIT":
      return "Deposit";
    case "WITHDRAWAL":
      return "Withdrawal";
    case "FEE":
      return "Fee";
    case "ADJUSTMENT":
      return "Adjustment";
    case "OPENING":
      return "Opening balance";
    default:
      return row.type ? row.type.toLowerCase() : "Movement";
  }
}
