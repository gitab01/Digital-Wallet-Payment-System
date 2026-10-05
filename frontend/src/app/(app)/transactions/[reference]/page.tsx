"use client";

import Link from "next/link";
import { useEffect, useState, use } from "react";

import { AbortedError, getTransaction } from "@/lib/api";
import { describeError } from "@/lib/errors";
import { formatDateTime } from "@/lib/money";
import { useDocumentTitle } from "@/lib/useDocumentTitle";
import type { LedgerEntry, TransactionDetail as TransactionDetailData } from "@/lib/types";
import { PageHeader } from "@/components/AppShell";
import { Amount } from "@/components/ui/Amount";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Chip, ReviewChip, StatusChip } from "@/components/ui/Chip";
import { CopyButton, Mono } from "@/components/ui/Copy";
import { SummaryRow } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { EmptyState, Panel, Skeleton } from "@/components/ui/Panel";

export default function TransactionDetailPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = use(params);
  return <TransactionDetail reference={reference} />;
}

function TransactionDetail({ reference }: { reference: string }) {
  useDocumentTitle(`Movement ${reference}`);

  const [detail, setDetail] = useState<TransactionDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    getTransaction(reference, controller.signal)
      .then((result) => {
        setDetail(result);
      })
      .catch((err: unknown) => {
        if (err instanceof AbortedError) return;
        setError(describeError(err, "Transaction detail"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [reference]);

  const incoming = detail?.direction === "IN";

  return (
    <>
      <PageHeader
        title={detail ? labelFor(detail.type, detail.direction) : "Movement"}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span>Reference</span>
            <Mono className="text-ink-muted">{reference}</Mono>
          </span>
        }
        actions={
          <Link href="/history">
            <Button size="sm" variant="secondary">
              <Icon name="chevronLeft" className="h-3.5 w-3.5" />
              All history
            </Button>
          </Link>
        }
      />

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : null}

      {!loading && error ? (
        <Callout tone="error" title="This movement could not be loaded">
          {error}
        </Callout>
      ) : null}

      {!loading && !error && !detail ? (
        <EmptyState title="Nothing to show" body="This reference returned no movement." />
      ) : null}

      {!loading && detail ? (
        <div className="space-y-5">
          <Panel title="Movement">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
              <div className="min-w-0">
                <p className="label">Amount</p>
                <Amount
                  value={detail.amount}
                  currency={detail.currency}
                  size="lg"
                  signed={incoming ? "+" : "-"}
                  tone={incoming ? "positive" : "negative"}
                  className="mt-1"
                />
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <StatusChip status={detail.status} />
                  <ReviewChip flagged={detail.reviewFlag} />
                  <Chip tone="muted">{detail.type}</Chip>
                </div>
              </div>
              <div className="text-right">
                <p className="label">Reference</p>
                <div className="mt-1.5 flex items-center justify-end gap-2">
                  <Mono className="text-body font-semibold">{detail.reference}</Mono>
                  <CopyButton value={detail.reference} />
                </div>
              </div>
            </div>

            <dl className="pt-1">
              <SummaryRow
                label="Counterparty"
                value={detail.counterparty || "Not named on this movement"}
              />
              <SummaryRow
                label="Fee"
                value={<Amount value={detail.fee} currency={detail.currency} size="sm" />}
              />
              <SummaryRow label="Initiated" value={formatDateTime(detail.initiatedAt)} />
              <SummaryRow label="Occurred" value={formatDateTime(detail.occurredAt)} />
              <SummaryRow label="Completed" value={formatDateTime(detail.completedAt)} />
              <SummaryRow
                label="Sender account"
                value={detail.senderAccountId !== null ? `#${detail.senderAccountId}` : "—"}
              />
              <SummaryRow
                label="Recipient account"
                value={detail.recipientAccountId !== null ? `#${detail.recipientAccountId}` : "—"}
              />
              <SummaryRow
                label="Anomaly score"
                value={
                  detail.anomalyScore === null ? (
                    "—"
                  ) : (
                    <span className="flex items-center justify-end gap-2">
                      <span className="num">{detail.anomalyScore.toFixed(2)}</span>
                      {detail.reviewFlag ? (
                        <span className="text-label uppercase tracking-wide text-debit">
                          flagged for review
                        </span>
                      ) : null}
                    </span>
                  )
                }
              />
            </dl>
          </Panel>

          {detail.reviewFlag ? (
            <Callout tone="error" title="Under review">
              The anomaly rules flagged this movement. It is still recorded in the ledger exactly as
              it happened — review changes what operations do next, not what already moved. Quote
              reference <span className="font-mono">{detail.reference}</span> if you raise it with
              support.
            </Callout>
          ) : null}

          <Panel
            title="Ledger entries"
            description="The double-sided record behind this movement. Debits and credits must net to zero."
          >
            <div className="space-y-4">
              <div>
                <p className="label mb-2">Entry ids</p>
                <ul className="flex flex-wrap gap-2">
                  {(detail.ledgerEntryIds ?? []).length > 0 ? (
                    detail.ledgerEntryIds.map((id) => (
                      <li key={id}>
                        <Chip tone="neutral">#{id}</Chip>
                      </li>
                    ))
                  ) : (
                    <li className="text-label text-ink-faint">
                      The projection recorded no entry ids for this movement.
                    </li>
                  )}
                </ul>
              </div>

              {detail.entries && detail.entries.length > 0 ? (
                <ul className="space-y-3">
                  {detail.entries.map((entry: LedgerEntry) => (
                    <li key={entry.id} className="rounded-md border border-line p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-body font-medium">{entry.accountLabel}</p>
                          <p className="mt-0.5 text-label uppercase tracking-wide text-ink-faint">
                            Entry #{entry.id} · account #{entry.accountId}
                          </p>
                        </div>
                        <div className="text-right">
                          <Amount
                            value={entry.amount}
                            currency={detail.currency}
                            size="sm"
                            tone={entry.role === "DEBIT" ? "negative" : "positive"}
                            signed={entry.role === "DEBIT" ? "-" : "+"}
                          />
                          <p className="mt-1">
                            <Chip tone={entry.role === "DEBIT" ? "negative" : "positive"}>
                              {entry.role}
                            </Chip>
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                        <p className="text-label text-ink-faint">
                          Balance after this entry
                        </p>
                        <Amount value={entry.balanceAfter} currency={detail.currency} size="sm" />
                      </div>
                      <p className="mt-2 text-label text-ink-faint">
                        Posted {formatDateTime(entry.createdAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-label text-ink-faint">
                  No ledger entries were returned for this movement.
                </p>
              )}
            </div>
          </Panel>
        </div>
      ) : null}
    </>
  );
}

function labelFor(type: string, direction: string): string {
  const incoming = direction === "IN";
  switch (type) {
    case "TRANSFER":
      return incoming ? "Transfer received" : "Transfer sent";
    case "DEPOSIT":
      return "Deposit";
    case "WITHDRAWAL":
      return "Withdrawal";
    case "FEE":
      return "Fee";
    case "ADJUSTMENT":
      return "Ledger adjustment";
    case "OPENING":
      return "Opening balance";
    default:
      return type ? `${type.charAt(0)}${type.slice(1).toLowerCase()}` : "Movement";
  }
}
