"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { decideKycSubmission, getKycQueue, getKycRecordDocuments } from "@/lib/api";
import { ApiError, describeError } from "@/lib/errors";
import { formatBytes, formatDateTime, formatDurationSince } from "@/lib/money";
import { useDocumentTitle } from "@/lib/useDocumentTitle";
import {
  documentTypeLabel,
  requiredSidesFor,
  type DocumentSide,
  type KycDocumentSummary,
  type KycQueueEntry,
} from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";
import { useToast } from "@/providers/ToastProvider";
import { ConfirmAction, type ActionFact } from "@/components/admin/ConfirmAction";
import { DocumentImageView } from "@/components/DocumentImage";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Chip } from "@/components/ui/Chip";
import { Icon } from "@/components/ui/Icon";
import { EmptyState, Panel, Skeleton } from "@/components/ui/Panel";

const SIDE_LABEL: Record<DocumentSide, string> = {
  FRONT: "Front",
  BACK: "Back",
};

/**
 * The review desk. Numbers alone would let a stolen document through on a correct
 * last-4, so this screen puts the images in front of the decision and keeps the two
 * flags that mean "look closer": a scan already filed by someone else, and a file
 * about the reviewer holding it.
 */
export default function ReviewDeskPage() {
  useDocumentTitle("Review desk");
  const { user } = useAuth();

  const [rows, setRows] = useState<KycQueueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    getKycQueue()
      .then((result) => {
        setRows(result ?? []);
        setError(null);
      })
      .catch((err: unknown) => setError(describeError(err, "Review queue")))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const selectedEntry = rows.find((row) => row.recordId === selected) ?? null;

  return (
    <>
      <PageHeader
        title="Review desk"
        description="Submissions waiting for a decision, oldest first on the service side and here. Approving moves a customer to a new tier and its limits, so it needs the images to be readable."
        actions={
          <Button size="sm" variant="secondary" onClick={load} disabled={loading}>
            <Icon name="refresh" className="h-3.5 w-3.5" />
            Reload queue
          </Button>
        }
      />

      <div className="space-y-5">
        {error ? (
          <Callout tone="error" title="The queue could not be read">
            {error}
          </Callout>
        ) : null}

        {notice ? <Callout tone="success">{notice}</Callout> : null}

        {rows.length > 0 ? (
          <p className="text-label uppercase tracking-wide text-ink-faint">
            {rows.length} submission{rows.length === 1 ? "" : "s"} waiting
            {user ? ` · signed in as ${user.email}` : ""}
          </p>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <div className={selectedEntry ? "hidden lg:block" : ""}>
            <QueueList
              rows={rows}
              loading={loading}
              error={error}
              selectedId={selected}
              onSelect={(id) => {
                setNotice(null);
                setSelected(id);
              }}
            />
          </div>

          <div className={selectedEntry ? "" : "hidden lg:block"}>
            {selectedEntry ? (
              <SubmissionDetail
                key={selectedEntry.recordId}
                entry={selectedEntry}
                onBack={() => setSelected(null)}
                onDecided={(message) => {
                  setSelected(null);
                  setNotice(message);
                  load();
                }}
              />
            ) : (
              <Panel>
                <p className="text-body leading-6 text-ink-muted">
                  Pick a submission to read its images and decide it. Nothing is shown here until you
                  do, and every image read is written to the audit trail.
                </p>
              </Panel>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function QueueList({
  rows,
  loading,
  error,
  selectedId,
  onSelect,
}: {
  rows: KycQueueEntry[];
  loading: boolean;
  error: string | null;
  selectedId: number | null;
  onSelect: (recordId: number) => void;
}) {
  if (loading && rows.length === 0) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        title={error ? "Nothing loaded" : "The queue is empty"}
        body={
          error
            ? "Fix the error above and reload — the queue is the only way a submission reaches a tier."
            : "Every submission has been decided. New ones arrive as customers finish signing up."
        }
      />
    );
  }

  return (
    <Panel padded={false} title="Waiting for a decision">
      <ul>
        {rows.map((row) => {
          const active = row.recordId === selectedId;
          const complete = row.missing.length === 0;
          return (
            <li key={row.recordId} className="border-b border-line last:border-b-0">
              <button
                type="button"
                onClick={() => onSelect(row.recordId)}
                aria-current={active ? "true" : undefined}
                className={`w-full px-4 py-3.5 text-left transition-colors sm:px-5 ${
                  active ? "bg-white" : "hover:bg-white"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-body font-medium text-ink">{row.fullName}</p>
                    <p className="mt-0.5 truncate text-label text-ink-faint">{row.email}</p>
                  </div>
                  <span className="num shrink-0 text-label text-ink-faint">
                    #{row.recordId}
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Chip tone="neutral">Tier {row.tier}</Chip>
                  <Chip tone="muted">{documentTypeLabel(row.documentType)}</Chip>
                  <Chip tone="muted">
                    <span className="num">•••• {row.last4}</span>
                  </Chip>
                  <Chip tone={complete ? "positive" : "negative"}>
                    {complete
                      ? "Both sides on file"
                      : `Missing ${row.missing.map((side) => SIDE_LABEL[side].toLowerCase()).join(", ")}`}
                  </Chip>
                  {row.duplicateOfUserId !== null ? (
                    <Chip tone="negative" title={`Another customer (user #${row.duplicateOfUserId}) already filed a scan with the same pixel content`}>
                      <Icon name="alert" className="h-3 w-3" />
                      Duplicate scan
                    </Chip>
                  ) : null}
                  {row.ownSubmission ? (
                    <Chip tone="neutral" title="You are the subject of this submission, so you cannot decide it">
                      Your own file
                    </Chip>
                  ) : null}
                </div>

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-label text-ink-faint">
                    Submitted {formatDateTime(row.submittedAt)}
                  </p>
                  <p className="num text-label font-medium uppercase tracking-wide text-ink-muted">
                    Waiting {formatDurationSince(row.submittedAt)}
                  </p>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function SubmissionDetail({
  entry,
  onBack,
  onDecided,
}: {
  entry: KycQueueEntry;
  onBack: () => void;
  onDecided: (message: string) => void;
}) {
  const { push } = useToast();
  const [documents, setDocuments] = useState<KycDocumentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{ approve: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<{ message: string; code: string } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    getKycRecordDocuments(entry.recordId)
      .then((result) => {
        setDocuments(result ?? []);
        setLoadError(null);
      })
      .catch((err: unknown) => setLoadError(describeError(err, "Submission documents")))
      .finally(() => setLoading(false));
  }, [entry.recordId]);

  useEffect(load, [load]);

  const bySide = useMemo(() => {
    const map: Partial<Record<DocumentSide, KycDocumentSummary>> = {};
    for (const document of documents) map[document.side] = document;
    return map;
  }, [documents]);

  const required = requiredSidesFor(entry.documentType);
  const blockedByOwn = entry.ownSubmission;

  const facts: ActionFact[] = [
    { label: "Customer", value: entry.fullName },
    { label: "Document", value: `${documentTypeLabel(entry.documentType)} •••• ${entry.last4}` },
    { label: "Tier now", value: `Tier ${entry.tier}` },
    { label: "Waiting", value: formatDurationSince(entry.submittedAt) },
  ];

  const decide = async (approve: boolean) => {
    setBusy(true);
    setRefused(null);
    try {
      await decideKycSubmission(entry.recordId, approve);
      push({
        tone: "success",
        title: approve ? "Submission approved" : "Submission rejected",
        body: approve
          ? "The customer's tier and limits moved to the next one."
          : "The customer keeps their current tier and can file again.",
      });
      setConfirming(null);
      onDecided(
        approve
          ? `Submission #${entry.recordId} approved — tier and limits moved, and the customer's wallets refresh on their next read.`
          : `Submission #${entry.recordId} rejected. The customer keeps their current tier and is told what to file.`,
      );
    } catch (err: unknown) {
      setConfirming(null);
      if (err instanceof ApiError && err.code === "DOCUMENTS_INCOMPLETE") {
        setRefused({ message: describeError(err, "Approval"), code: err.code });
      } else {
        setRefused({ message: describeError(err, "Decision"), code: "DECISION_FAILED" });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      title={`Submission #${entry.recordId}`}
      description={`${entry.fullName} · ${entry.email}`}
      actions={
        <Button size="sm" variant="ghost" onClick={onBack} className="lg:hidden">
          <Icon name="chevronLeft" className="h-3.5 w-3.5" />
          Queue
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip tone="neutral">Tier {entry.tier}</Chip>
          <Chip tone="muted">{documentTypeLabel(entry.documentType)}</Chip>
          <Chip tone="muted">
            <span className="num">•••• {entry.last4}</span>
          </Chip>
          <Chip tone={entry.missing.length === 0 ? "positive" : "negative"}>
            {entry.missing.length === 0
              ? "Complete"
              : `Missing ${entry.missing.map((side) => SIDE_LABEL[side].toLowerCase()).join(", ")}`}
          </Chip>
        </div>

        {entry.duplicateOfUserId !== null ? (
          <Callout tone="error" title="Same pixel content as another customer">
            User #{entry.duplicateOfUserId} already filed a scan that matches this one. Two people
            cannot own one identity document — compare the images before deciding either.
            <Link
              href={`/admin/clients/${entry.duplicateOfUserId}`}
              className="mt-1 block font-medium text-accent underline underline-offset-4"
            >
              Open that customer
            </Link>
          </Callout>
        ) : null}

        {blockedByOwn ? (
          <Callout tone="pending" title="This submission is yours">
            A reviewer cannot approve or reject their own documents, so the decision buttons are
            disabled. Someone else on the desk has to read it.
          </Callout>
        ) : null}

        <div>
          <p className="label mb-3">
            {`Images on file — ${documentTypeLabel(entry.documentType)} needs ${required
              .map((side) => SIDE_LABEL[side].toLowerCase())
              .join(" and ")}`}
          </p>
          {loadError ? (
            <Callout tone="error">{loadError}</Callout>
          ) : loading ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {required.map((side) => (
                <Skeleton key={side} className="h-40 w-full" />
              ))}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {required.map((side) => {
                const stored = bySide[side];
                return (
                  <div key={side} className="space-y-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-label font-medium uppercase tracking-wide text-ink-muted">
                        {SIDE_LABEL[side]}
                      </p>
                      {stored ? (
                        <span className="num text-label text-ink-faint">{formatBytes(stored.byteLength)}</span>
                      ) : (
                        <Chip tone="negative">Not uploaded</Chip>
                      )}
                    </div>
                    {stored ? (
                      <DocumentImageView
                        documentId={stored.id}
                        alt={`${documentTypeLabel(entry.documentType)} — ${SIDE_LABEL[side]}`}
                        summary={`Document #${stored.id} · uploaded ${formatDateTime(stored.uploadedAt)} · this read is audited.`}
                        frameClassName="h-44"
                      />
                    ) : (
                      <div className="flex h-44 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-line px-4 text-center">
                        <Icon name="alert" className="h-5 w-5 text-ink-faint" />
                        <p className="text-label leading-4 text-ink-faint">
                          The customer has not supplied this side, so approval is refused until they
                          do.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {refused ? (
          <Callout tone="error" title="Decision refused" code={refused.code}>
            {refused.message}
          </Callout>
        ) : null}

        <div className="space-y-3 border-t border-line pt-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              block
              disabled={blockedByOwn || busy}
              loading={busy && confirming?.approve === true}
              onClick={() => setConfirming({ approve: true })}
            >
              Approve
            </Button>
            <Button
              block
              variant="danger"
              disabled={blockedByOwn || busy}
              loading={busy && confirming?.approve === false}
              onClick={() => setConfirming({ approve: false })}
            >
              Reject
            </Button>
          </div>
          <p className="text-label leading-5 text-ink-faint">
            Approval moves the customer to the next tier and its limits immediately; rejection leaves
            their current tier untouched. Both are recorded against your account.
          </p>
        </div>
      </div>

      <ConfirmAction
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        onConfirm={() => void decide(confirming?.approve ?? false)}
        busy={busy}
        title={confirming?.approve ? "Approve this submission" : "Reject this submission"}
        tone={confirming?.approve ? "primary" : "danger"}
        confirmLabel={confirming?.approve ? "Approve and raise the tier" : "Reject this submission"}
        body={
          confirming?.approve
            ? "You are satisfied both sides are legible, belong to this person, and are not another customer's document."
            : "You are sending this back. The customer keeps their current tier and has to file again."
        }
        facts={facts}
      />
    </Panel>
  );
}
