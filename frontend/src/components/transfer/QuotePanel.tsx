"use client";

import type { ReactNode } from "react";

import { describeCode } from "@/lib/errors";
import { formatAmount, ratioOf } from "@/lib/money";
import type { CurrencyCode, Money, TransferQuote } from "@/lib/types";
import { Amount } from "@/components/ui/Amount";
import { Callout } from "@/components/ui/Callout";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Panel";

export type QuoteState = "idle" | "loading" | "ready" | "error";

/**
 * The live read-out of GET /api/transfers/quote. Every number here is the server's,
 * computed before money moves: the client never derives a fee or a resulting
 * balance, it only formats what came back.
 */
export function QuotePanel({
  state,
  quote,
  error,
  amount,
  currency,
  dailyCap,
}: {
  state: QuoteState;
  quote: TransferQuote | null;
  error: string | null;
  /** The exact wire amount the quote was requested for. */
  amount: Money | null;
  currency: CurrencyCode | null;
  dailyCap: Money | null;
}) {
  if (state === "idle") {
    return (
      <Callout tone="pending" title="Awaiting a quote">
        Type an amount and we price it instantly: the fee, the total that leaves your wallet, the
        balance you would be left with, and how much of today's limit is spare.
      </Callout>
    );
  }

  if (state === "error") {
    return (
      <Callout tone="error" title="This amount could not be priced">
        {error ?? "The service did not return a quote."}
      </Callout>
    );
  }

  if (state === "loading" || !quote) {
    return (
      <div className="rounded-lg border border-line p-4">
        <div className="flex items-center gap-2 text-label uppercase tracking-wide text-ink-faint">
          <Icon name="clock" className="h-3.5 w-3.5" />
          Pricing your transfer
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    );
  }

  const capacityLeft = dailyCap ? ratioOf(quote.remainingToday, dailyCap) : null;

  return (
    <div className="space-y-5 rounded-lg border border-line p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-4">
        <p className="label">Sending to</p>
        <p className="text-body font-medium">{quote.recipientName || "Unresolved recipient"}</p>
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-5">
        <Cell label="Amount">
          <Amount value={amount} currency={currency} size="sm" />
        </Cell>
        <Cell label="Fee">
          <Amount value={quote.fee} currency={currency} size="sm" />
        </Cell>
        <Cell label="Total debit">
          <Amount value={quote.totalDebit} currency={currency} size="sm" signed="-" tone="negative" />
        </Cell>
        <Cell label="Balance after">
          <Amount value={quote.senderBalanceAfter} currency={currency} size="sm" />
        </Cell>
      </dl>

      <div>
        <div className="flex items-baseline justify-between gap-3">
          <p className="label">Capacity left today</p>
          <p className="num text-body">
            {formatAmount(quote.remainingToday, null)?.value ?? "—"}
          </p>
        </div>
        <div
          className="mt-2 h-1.5 w-full overflow-hidden rounded-full border border-line"
          role="progressbar"
          aria-label="Share of today's limit still available"
          aria-valuenow={capacityLeft === null ? undefined : Math.round(capacityLeft * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full bg-ink"
            style={{ width: `${Math.round((capacityLeft ?? 0) * 100)}%` }}
          />
        </div>
      </div>

      {quote.allowed ? (
        <Callout tone="success" title="This transfer is allowed">
          {quote.recipientName} would be left with{" "}
          <span className="num">
            {formatAmount(quote.recipientBalanceAfter, currency)?.signed ?? "—"}
          </span>
          . Nothing has moved yet — you still review and authorise it.
        </Callout>
      ) : (
        <Callout
          tone="error"
          title="This transfer would be refused"
          code={quote.reason ?? undefined}
        >
          {quote.reason
            ? describeCode(quote.reason)
            : "The service refused this amount without giving a reason code."}
        </Callout>
      )}
    </div>
  );
}

function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}
