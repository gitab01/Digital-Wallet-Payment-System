"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { AbortedError, listAdminAudit, reconcile } from "@/lib/api";
import { describeError } from "@/lib/errors";
import { formatDateTime } from "@/lib/money";
import { useDocumentTitle } from "@/lib/useDocumentTitle";
import type { AdminAuditEvent, ReconcileReport } from "@/lib/types";
import { ConfirmAction, type ActionFact } from "@/components/admin/ConfirmAction";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Chip } from "@/components/ui/Chip";
import { Mono } from "@/components/ui/Copy";
import { Field, SelectField, SummaryRow } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { EmptyState, Panel, Skeleton } from "@/components/ui/Panel";

const PAGE_SIZES = ["20", "50", "100"];

/**
 * The codes this desk filters on. The vocabulary is the service's and is not
 * closed, so the list is a convenience and the exact-code box is the escape route
 * — neither one decides what the trail actually contains.
 */
const ACTION_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "KYC_DOCUMENT_VIEWED", label: "Identity image opened" },
  { value: "KYC_DOCUMENT_UPLOADED", label: "Document uploaded" },
  { value: "KYC_SUBMITTED", label: "Submission filed" },
  { value: "KYC_DECIDED", label: "Submission decided" },
  { value: "ADMIN_CLIENT_UPDATED", label: "Customer changed by the desk" },
  { value: "ADMIN_DECISION", label: "Operations decision" },
  { value: "RECONCILIATION_DRIFT", label: "Ledger drift" },
  { value: "LIMIT_BREACH", label: "Limit breach" },
  { value: "PIN_FAILURE", label: "PIN failure" },
  { value: "PIN_LOCKOUT", label: "PIN lockout" },
  { value: "PIN_CHANGED", label: "PIN changed" },
  { value: "LOGIN", label: "Sign-in" },
  { value: "LOGIN_FAILED", label: "Sign-in refused" },
  { value: "TOKEN_REUSE_DETECTED", label: "Refresh token reused" },
  { value: "TRANSFER", label: "Transfer" },
  { value: "DEPOSIT", label: "Deposit" },
  { value: "WITHDRAWAL", label: "Withdrawal" },
];

const KNOWN_ACTION_CODES = new Set(ACTION_OPTIONS.map((option) => option.value));

export default function AdminHealthPage() {
  return (
    /* The action filter can arrive from a customer record, so the query is read here. */
    <Suspense
      fallback={
        <div className="space-y-4">
          <Skeleton className="h-56 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      }
    >
      <HealthContent />
    </Suspense>
  );
}

function HealthContent() {
  useDocumentTitle("Ledger and audit");
  const params = useSearchParams();

  return (
    <>
      <PageHeader
        title="Ledger and audit"
        description="Two things a decision cannot rest on memory: whether the balances on screen are still proved against the ledger, and who has read what."
      />

      <div className="space-y-5">
        <ReconcilePanel />
        <AuditPanel seededAction={params.get("action")?.trim() ?? ""} />
      </div>
    </>
  );
}

/* ----------------------------------------------------------- reconciliation -- */

function ReconcilePanel() {
  const [report, setReport] = useState<ReconcileReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const run = async (repair: boolean) => {
    setBusy(true);
    setError(null);
    try {
      setReport(await reconcile(repair));
      setConfirming(false);
    } catch (err: unknown) {
      setError(describeError(err, "Reconciliation"));
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      title="Ledger proof"
      description="Recomputes every wallet from the ledger entries and compares it to the stored projection. The ledger is the truth; the projection is what the screens read."
    >
      <div className="space-y-5">
        {error ? (
          <Callout tone="error" title="The proof did not complete">
            {error}
          </Callout>
        ) : null}

        {report ? <ReportView report={report} /> : null}

        {!report && !error && !busy ? (
          <p className="text-body leading-6 text-ink-muted">
            Nothing has been proved since you opened this screen. The nightly run is the usual source
            of the record; this control asks for one on demand.
          </p>
        ) : null}

        {busy && !report ? <Skeleton className="h-24 w-full" /> : null}

        <div className="space-y-3 border-t border-line pt-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button block variant="secondary" onClick={() => void run(false)} loading={busy} disabled={busy}>
              Prove every wallet
            </Button>
            <Button block variant="danger" onClick={() => setConfirming(true)} disabled={busy}>
              Repair the drift
            </Button>
          </div>
          <p className="text-label leading-5 text-ink-faint">
            Proving is read-only for the ledger but not for customers: an account whose projection
            disagrees has its cash-out frozen by the same run, because money leaving a balance that
            cannot be proved is the one thing that cannot be undone. Deposits and incoming transfers
            stay open so a drift does not punish the customer twice.
          </p>
          <p className="text-label leading-5 text-ink-faint">
            Repair is the same route sent as <Mono>repair=true</Mono>, a different request and a
            different decision — it rewrites the projection to match the ledger, and it is only ever
            sent when you confirm it above.
          </p>
        </div>
      </div>

      <ConfirmAction
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => void run(true)}
        busy={busy}
        title="Repair the drifted projections"
        tone="danger"
        confirmLabel="Move them to match the ledger"
        body={
          "This writes to the stored balance of every account that disagrees, so the screen stops showing a number the ledger does not support. The ledger entries themselves are never touched."
        }
        facts={repairFacts(report)}
      />
    </Panel>
  );
}

/**
 * API.md fixes the request but not the body of this route, so the counts the desk
 * reads by name are shown as they are labelled, and anything else the service
 * returns comes through below them instead of being thrown away.
 */
function ReportView({ report }: { report: ReconcileReport }) {
  const checked = countOf(report, "checked");
  const matched = countOf(report, "matched");
  const drifted = countOf(report, "drifted");
  const repaired = countOf(report, "repaired");
  const drifts = stringsOf(report, "drifts");

  const headline =
    drifted === null
      ? { tone: "info" as const, title: "The proof has run" }
      : drifted === 0
        ? { tone: "success" as const, title: "Every wallet agrees with the ledger" }
        : repaired && repaired > 0
          ? { tone: "pending" as const, title: "Drift found, and repaired" }
          : { tone: "error" as const, title: "Drift found" };

  return (
    <div className="space-y-4">
      <Callout tone={headline.tone} title={headline.title}>
        {drifted === null ? (
          "The service replied, but not with the fields this screen reads by name — they are listed below exactly as they arrived."
        ) : drifted === 0 ? (
          <>
            {checked !== null ? `${checked} wallet${checked === 1 ? "" : "s"} proved` : "The wallets proved"}
            {matched !== null ? `, ${matched} of them matching their ledger entries` : ""}. Nothing was
            frozen and nothing was rewritten.
          </>
        ) : (
          <>
            {drifted} wallet{drifted === 1 ? "" : "s"} did not match
            {checked !== null ? ` of ${checked} proved` : ""}
            {repaired && repaired > 0 ? `, and ${repaired} were moved to match the ledger` : ""}.
            Cash-out is frozen on the accounts that still disagree.
          </>
        )}
      </Callout>

      <dl>
        <CountRow label="Wallets proved" value={checked} />
        <CountRow label="Matched the ledger" value={matched} tone="positive" />
        <CountRow label="Drifted" value={drifted} tone={drifted && drifted > 0 ? "negative" : "neutral"} />
        <CountRow label="Repaired" value={repaired} />
      </dl>

      {drifts && drifts.length > 0 ? (
        <div>
          <p className="label mb-2">Drift lines</p>
          <ul className="space-y-1.5 rounded-md border border-line px-4 py-3">
            {drifts.map((line, index) => (
              <li key={`${line}-${index}`}>
                <Mono className="text-ink-muted">{line}</Mono>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-label leading-5 text-ink-faint">
            These are the service&rsquo;s own words, and its counts are in minor units. They are
            printed exactly as received: this client does not reformat or add them up.
          </p>
        </div>
      ) : null}

      <OtherFields report={report} handled={["checked", "matched", "drifted", "repaired", "drifts"]} />
    </div>
  );
}

function CountRow({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number | null;
  tone?: "neutral" | "positive" | "negative";
}) {
  return (
    <SummaryRow
      label={label}
      value={value === null ? <span className="text-ink-faint">Not reported</span> : <span className="num">{value}</span>}
      tone={value === null ? "neutral" : tone}
    />
  );
}

/** Keys this screen has no name for still get shown rather than dropped. */
function OtherFields({ report, handled }: { report: ReconcileReport; handled: string[] }) {
  const extra = Object.entries(report).filter(
    ([key, value]) => !handled.includes(key) && isScalar(value),
  );
  if (extra.length === 0) return null;

  return (
    <dl className="border-t border-line pt-2">
      {extra.map(([key, value]) => (
        <SummaryRow
          key={key}
          label={key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ")}
          value={<span className="num">{String(value)}</span>}
        />
      ))}
    </dl>
  );
}

function repairFacts(report: ReconcileReport | null): ActionFact[] {
  const drifted = countOf(report, "drifted");
  return [
    {
      label: "Last proof",
      value: report ? "Run from this screen" : "None since you opened it",
    },
    {
      label: "Wallets that disagree",
      value:
        drifted === null ? (
          <span className="text-ink-faint">Run the proof first</span>
        ) : (
          <span className="num">{drifted}</span>
        ),
    },
    { label: "Ledger entries", value: "Untouched" },
    { label: "Projections", value: "Rewritten to match" },
  ];
}

function countOf(report: ReconcileReport | null, key: string): number | null {
  const raw = report?.[key];
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "" && Number.isFinite(Number(raw))) return Number(raw);
  return null;
}

function stringsOf(report: ReconcileReport | null, key: string): string[] | null {
  const raw = report?.[key];
  if (!Array.isArray(raw)) return null;
  return raw.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function isScalar(value: unknown): boolean {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  );
}

/* ------------------------------------------------------------------- audit -- */

function AuditPanel({ seededAction }: { seededAction: string }) {
  const [choice, setChoice] = useState(KNOWN_ACTION_CODES.has(seededAction) ? seededAction : "");
  const [exact, setExact] = useState(KNOWN_ACTION_CODES.has(seededAction) ? "" : seededAction);
  const [size, setSize] = useState("50");
  const [page, setPage] = useState(0);

  const [rows, setRows] = useState<AdminAuditEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const hasRows = useRef(false);

  const filter = exact.trim() || choice;

  const query = useMemo(
    () => ({ action: filter || undefined, page, size: Number(size) }),
    [filter, page, size],
  );

  useEffect(() => {
    const controller = new AbortController();
    if (!hasRows.current) setLoading(true);

    listAdminAudit(query, controller.signal)
      .then((result) => {
        hasRows.current = true;
        setRows(result.items ?? []);
        setTotal(result.total ?? 0);
        setError(null);
      })
      .catch((err: unknown) => {
        if (err instanceof AbortedError) return;
        setError(describeError(err, "Audit trail"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [query, nonce]);

  const reload = useCallback(() => {
    hasRows.current = false;
    setNonce((prev) => prev + 1);
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / Number(size)));

  return (
    <>
      <Panel title="Filter the trail">
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          <SelectField
            label="Action"
            value={choice}
            options={[{ value: "", label: "Any action" }, ...ACTION_OPTIONS]}
            onChange={(value) => {
              setChoice(value);
              setExact("");
              setPage(0);
            }}
          />
          <Field
            label="Or the exact code"
            value={exact}
            onChange={(value) => {
              setExact(value.toUpperCase().replace(/[^A-Z0-9_]/g, ""));
              setPage(0);
            }}
            placeholder="KYC_DOCUMENT_VIEWED"
            autoComplete="off"
            hint="Overrides the list above. Use it for a code the service records but this screen does not know yet."
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
              ? "Reading the trail…"
              : `${total} event${total === 1 ? "" : "s"}${filter ? ` with action ${filter}` : " recorded"}`}
          </p>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setChoice("");
              setExact("");
              setPage(0);
            }}
          >
            Clear the filter
          </Button>
        </div>
      </Panel>

      {seededAction ? (
        <Callout tone="info" title={`Showing ${actionLabel(seededAction)}`}>
          You came from a customer record asking who has opened those images. Every row below is one
          read of one identity photograph, by its owner or by the desk, and it carries the account it
          was read under. The trail filters by action only, not by customer, so that account column is
          how you find the one you are asking about.
        </Callout>
      ) : null}

      {error ? (
        <Callout tone="error" title="The trail could not be loaded">
          {error}
        </Callout>
      ) : null}

      <Panel
        title="Cross-account trail"
        description="Every customer's security and operations events in one list, newest first. This is the only screen where a reviewer reads someone else's history."
        padded={false}
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={reload} disabled={loading}>
              <Icon name="refresh" className="h-3.5 w-3.5" />
              Reload
            </Button>
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
              title="No event matches this filter"
              body="The trail is append-only and covers every account, so an empty page means the code is wrong rather than that nothing happened. Clear the filter to see what the service does record."
            />
          </div>
        ) : (
          <ul className={loading ? "opacity-60" : ""}>
            {rows.map((row) => (
              <li key={row.id ?? `${row.createdAt}-${row.action}`} className="border-b border-line last:border-b-0">
                <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3.5 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-baseline gap-2">
                      <span className="text-body font-medium text-ink">{actionLabel(row.action)}</span>
                      <span className="font-mono text-label uppercase tracking-wide text-ink-faint">
                        {row.action}
                      </span>
                      <span className="num text-label text-ink-faint">#{row.id}</span>
                    </p>
                    <p className="mt-0.5 truncate text-label text-ink-faint">
                      {row.userEmail ?? "No account attached"}
                    </p>
                    {row.detail ? (
                      <p className="mt-1 max-w-xl break-words text-label leading-5 text-ink-muted">
                        {row.detail}
                      </p>
                    ) : null}
                    {row.ipAddress ? (
                      <p className="mt-0.5 font-mono text-label text-ink-faint">{row.ipAddress}</p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Chip
                      tone={
                        row.outcome === "SUCCESS"
                          ? "positive"
                          : row.outcome === "FAILED"
                            ? "negative"
                            : "muted"
                      }
                    >
                      {row.outcome ?? "Unknown"}
                    </Chip>
                    <p className="num text-label text-ink-faint">{formatDateTime(row.createdAt)}</p>
                    {row.userEmail ? (
                      <Link
                        href={`/admin/clients?query=${encodeURIComponent(row.userEmail)}`}
                        className="inline-flex items-center gap-1 text-label font-medium uppercase tracking-wide text-ink-muted hover:text-ink"
                      >
                        Customer
                        <Icon name="chevronRight" className="h-3 w-3" />
                      </Link>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}

/** An unknown code still reads as English; only the raw code is authoritative. */
function actionLabel(code: string | null | undefined): string {
  if (!code) return "Unknown action";
  const known = ACTION_OPTIONS.find((option) => option.value === code);
  return known ? known.label : code.replace(/_/g, " ").toLowerCase();
}
