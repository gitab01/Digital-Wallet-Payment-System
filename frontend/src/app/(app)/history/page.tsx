"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { AbortedError, listTransactions } from "@/lib/api";
import { describeError } from "@/lib/errors";
import { todayIso } from "@/lib/money";
import { useDocumentTitle } from "@/lib/useDocumentTitle";
import { validateDateRange } from "@/lib/validation";
import type { TransactionRow } from "@/lib/types";
import { useWallet } from "@/providers/WalletProvider";
import { PageHeader } from "@/components/AppShell";
import { TransactionRowItem } from "@/components/TransactionRowItem";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Field, SelectField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { EmptyState, Panel, Skeleton } from "@/components/ui/Panel";

const PAGE_SIZES = ["10", "20", "50"];

const THIRTY_DAYS_AGO = (() => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 30);
  return date.toISOString().slice(0, 10);
})();

export default function HistoryPage() {
  useDocumentTitle("History");

  const { accounts } = useWallet();
  const [accountId, setAccountId] = useState("");
  const [from, setFrom] = useState(THIRTY_DAYS_AGO);
  const [to, setTo] = useState(todayIso());
  const [size, setSize] = useState("20");
  const [page, setPage] = useState(0);

  const [rows, setRows] = useState<TransactionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rangeError, setRangeError] = useState<string | null>(null);
  const hasRows = useRef(false);

  const filters = useMemo(
    () => ({
      accountId: accountId ? Number(accountId) : undefined,
      from: from || undefined,
      to: to || undefined,
      page,
      size: Number(size),
    }),
    [accountId, from, to, page, size],
  );

  useEffect(() => {
    const controller = new AbortController();
    if (!hasRows.current) setLoading(true);

    listTransactions(filters, controller.signal)
      .then((result) => {
        hasRows.current = true;
        setRows(result.items ?? []);
        setTotal(result.total ?? 0);
        setError(null);
      })
      .catch((err: unknown) => {
        if (err instanceof AbortedError) return;
        setError(describeError(err, "History"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [filters]);

  const totalPages = Math.max(1, Math.ceil(total / Number(size)));

  const applyRange = (nextFrom: string, nextTo: string) => {
    const errors = validateDateRange(nextFrom, nextTo);
    setRangeError(errors.from ?? errors.to ?? null);
    return !errors.from && !errors.to;
  };

  return (
    <>
      <PageHeader
        title="History"
        description="Every movement recorded against your accounts, filtered by wallet and date."
      />

      <div className="space-y-5">
        <Panel title="Filters">
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <SelectField
              label="Account"
              value={accountId}
              onChange={(value) => {
                setAccountId(value);
                setPage(0);
              }}
              options={[
                { value: "", label: "All accounts" },
                ...accounts.map((account) => ({
                  value: String(account.id),
                  label: `${account.label} (#${account.id})`,
                })),
              ]}
            />
            <Field
              label="From"
              type="date"
              value={from}
              onChange={(value) => {
                setFrom(value);
                if (applyRange(value, to)) setPage(0);
              }}
            />
            <Field
              label="To"
              type="date"
              value={to}
              onChange={(value) => {
                setTo(value);
                if (applyRange(from, value)) setPage(0);
              }}
            />
            <SelectField
              label="Per page"
              value={size}
              onChange={(value) => {
                setSize(value);
                setPage(0);
              }}
              options={PAGE_SIZES.map((value) => ({ value, label: value }))}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <p className="num text-label text-ink-faint">
              {loading ? "Loading movements…" : `${total} movement${total === 1 ? "" : "s"} match these filters`}
            </p>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setAccountId("");
                setFrom(THIRTY_DAYS_AGO);
                setTo(todayIso());
                setPage(0);
                setRangeError(null);
              }}
            >
              Reset filters
            </Button>
          </div>

          {rangeError ? (
            <p className="mt-3 text-label text-debit">{rangeError}</p>
          ) : null}
        </Panel>

        {error ? (
          <Callout tone="error" title="This page could not be loaded">
            {error}
          </Callout>
        ) : null}

        <Panel
          title={`Page ${page + 1} of ${totalPages}`}
          padded={false}
          actions={
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={page === 0 || loading}
                onClick={() => setPage((prev) => Math.max(0, prev - 1))}
                trailing={<Icon name="chevronLeft" className="h-3.5 w-3.5" />}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={page + 1 >= totalPages || loading}
                onClick={() => setPage((prev) => prev + 1)}
              >
                Next
                <Icon name="chevronRight" className="h-3.5 w-3.5" />
              </Button>
            </div>
          }
        >
          {loading && rows.length === 0 ? (
            <div className="space-y-3 p-4 sm:p-5">
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="h-16 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="p-4 sm:p-5">
              <EmptyState
                title="No movements in this range"
                body="Widen the dates, or pick another account. New movements appear here the moment the ledger commits them."
              />
            </div>
          ) : (
            <ul className={loading ? "opacity-60" : ""}>
              {rows.map((row) => (
                <TransactionRowItem key={row.reference} row={row} />
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
