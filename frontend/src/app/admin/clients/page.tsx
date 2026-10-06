"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { AbortedError, listClients } from "@/lib/api";
import { describeError } from "@/lib/errors";
import { formatDate } from "@/lib/money";
import { useDocumentTitle } from "@/lib/useDocumentTitle";
import type { AdminClientRow } from "@/lib/types";
import { PageHeader } from "@/components/AppShell";
import { Amount } from "@/components/ui/Amount";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Chip } from "@/components/ui/Chip";
import { Field, SelectField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { EmptyState, Panel, Skeleton } from "@/components/ui/Panel";

const PAGE_SIZES = ["10", "20", "50"];

const STATUS_OPTIONS = [
  { value: "", label: "Any status" },
  { value: "ACTIVE", label: "Active" },
  { value: "PENDING_KYC", label: "Pending verification" },
  { value: "SUSPENDED", label: "Suspended" },
  { value: "CLOSED", label: "Closed" },
];

/** Typing in a search box should not start a request per keystroke. */
const SEARCH_DEBOUNCE_MS = 350;

export default function AdminClientsPage() {
  /* `useSearchParams` needs a boundary: the list can arrive already filtered from
     the audit trail, and that must not decide the shape of the whole page. */
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      }
    >
      <ClientsContent />
    </Suspense>
  );
}

function ClientsContent() {
  useDocumentTitle("Clients");

  /* A link from an audit row carries the account it was read under. */
  const seeded = useSearchParams().get("query")?.trim() ?? "";
  const [search, setSearch] = useState(seeded);
  const [query, setQuery] = useState(seeded);
  const [status, setStatus] = useState("");
  const [size, setSize] = useState("20");
  const [page, setPage] = useState(0);

  const [rows, setRows] = useState<AdminClientRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const hasRows = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(search.trim());
      setPage(0);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [search]);

  const filters = useMemo(
    () => ({ query, status: status || undefined, page, size: Number(size) }),
    [query, status, page, size],
  );

  useEffect(() => {
    const controller = new AbortController();
    if (!hasRows.current) setLoading(true);

    listClients(filters, controller.signal)
      .then((result) => {
        hasRows.current = true;
        setRows(result.items ?? []);
        setTotal(result.total ?? 0);
        setError(null);
      })
      .catch((err: unknown) => {
        if (err instanceof AbortedError) return;
        setError(describeError(err, "Client list"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [filters, nonce]);

  const reload = () => {
    hasRows.current = false;
    setNonce((prev) => prev + 1);
  };

  const totalPages = Math.max(1, Math.ceil(total / Number(size)));

  return (
    <>
      <PageHeader
        title="Clients"
        description="Every customer, their wallets and their state. Opening one shows the whole record and the actions the review desk can take on it."
        actions={
          <>
            <span className="num text-label text-ink-faint">
              {loading ? "Loading" : `${total} on record`}
            </span>
            <Button size="sm" variant="secondary" onClick={reload} disabled={loading}>
              <Icon name="refresh" className="h-3.5 w-3.5" />
              Reload
            </Button>
          </>
        }
      />

      <div className="space-y-5">
        <Panel title="Find a customer">
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            <Field
              label="Search"
              value={search}
              onChange={setSearch}
              placeholder="Email or name fragment"
              autoComplete="off"
              hint="Matches an e-mail or name fragment on the service side."
            />
            <SelectField
              label="Status"
              value={status}
              options={STATUS_OPTIONS}
              onChange={(value) => {
                setStatus(value);
                setPage(0);
              }}
            />
            <SelectField
              label="Per page"
              value={size}
              options={PAGE_SIZES.map((value) => ({ value, label: value }))}
              onChange={(value) => {
                setSize(value);
                setPage(0);
              }}
            />
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <p className="num text-label text-ink-faint">
              {loading
                ? "Loading customers…"
                : `${total} customer${total === 1 ? "" : "s"} match this search`}
            </p>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setSearch("");
                setQuery("");
                setStatus("");
                setPage(0);
              }}
            >
              Reset
            </Button>
          </div>
        </Panel>

        {error ? (
          <Callout tone="error" title="This list could not be loaded">
            {error}
          </Callout>
        ) : null}

        <Panel
          title={`Page ${page + 1} of ${totalPages}`}
          description="Balances stay per currency. Nothing here adds ETB to USD — a wallet total across currencies is not a meaningful number."
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
              {Array.from({ length: 5 }, (_, index) => (
                <Skeleton key={index} className="h-20 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="p-4 sm:p-5">
              <EmptyState
                title="No customer matches this search"
                body="Search is a fragment match, so a full e-mail address is the surest way in. Clear the status filter if the account is suspended or still pending verification."
              />
            </div>
          ) : (
            <ul className={loading ? "opacity-60" : ""}>
              {rows.map((row) => (
                <li key={row.id} className="border-b border-line last:border-b-0">
                  <Link
                    href={`/admin/clients/${row.id}`}
                    className="flex flex-wrap items-start justify-between gap-3 px-4 py-3.5 hover:border-b-ink sm:px-5"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-body font-medium text-ink">{row.fullName}</span>
                        <span className="num shrink-0 text-label text-ink-faint">#{row.id}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-label text-ink-faint">
                        {row.email}
                      </span>
                      <span className="mt-2 flex flex-wrap items-center gap-1.5">
                        <Chip tone="neutral">Tier {row.kycTier}</Chip>
                        <Chip
                          tone={
                            row.status === "ACTIVE"
                              ? "positive"
                              : row.status === "SUSPENDED" || row.status === "CLOSED"
                                ? "negative"
                                : "muted"
                          }
                        >
                          {row.status?.replace(/_/g, " ") ?? "Unknown"}
                        </Chip>
                        {row.withdrawalsFrozen ? <Chip tone="negative">Cash-out frozen</Chip> : null}
                        <span className="text-label text-ink-faint">
                          Since {formatDate(row.createdAt)}
                        </span>
                      </span>
                    </span>

                    <span className="flex shrink-0 flex-col items-end gap-1">
                      {row.wallets.length === 0 ? (
                        <span className="text-label text-ink-faint">No wallets</span>
                      ) : (
                        row.wallets.map((wallet) => (
                          <Amount
                            key={wallet.currency}
                            value={wallet.balance}
                            currency={wallet.currency}
                            size="sm"
                          />
                        ))
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}

