"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, use } from "react";

import {
  getClient,
  setClientStatus,
  setClientWithdrawalFreeze,
  unlockClientPin,
} from "@/lib/api";
import { describeError } from "@/lib/errors";
import { missingSidesFor } from "@/lib/kyc";
import { formatDate, formatDateTime } from "@/lib/money";
import { useDocumentTitle } from "@/lib/useDocumentTitle";
import {
  DOCUMENT_SIDES,
  documentTypeLabel,
  type AdminClientDetail,
  type AdminClientStatus,
  type AdminClientUser,
  type DocumentSide,
} from "@/lib/types";
import { ConfirmAction, type ActionFact } from "@/components/admin/ConfirmAction";
import { DocumentLink } from "@/components/DocumentImage";
import { Amount } from "@/components/ui/Amount";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Chip } from "@/components/ui/Chip";
import { Mono } from "@/components/ui/Copy";
import { SummaryRow } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Panel, Skeleton } from "@/components/ui/Panel";

const SIDE_LABEL: Record<DocumentSide, string> = {
  FRONT: "Front",
  BACK: "Back",
};

type PendingAction =
  | { kind: "status"; next: AdminClientStatus }
  | { kind: "freeze"; frozen: boolean }
  | { kind: "pinUnlock" };

/**
 * One customer, whole: wallets, limits, everything they have ever filed for KYC,
 * their recent movements, and the three things the desk can do about them. Each
 * action is confirmed in words before it is sent, and the state that results is
 * stated back afterwards.
 */
export default function AdminClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const numericId = Number(id);
  const valid = Number.isInteger(numericId) && numericId > 0;

  useDocumentTitle(valid ? `Client #${numericId}` : "Client");

  const [detail, setDetail] = useState<AdminClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!valid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    getClient(numericId)
      .then((view) => {
        setDetail(view);
        setError(null);
      })
      .catch((err: unknown) => setError(describeError(err, "Customer record")))
      .finally(() => setLoading(false));
  }, [numericId, valid]);

  useEffect(load, [load]);

  const run = async (action: PendingAction) => {
    setBusy(true);
    setError(null);
    try {
      if (action.kind === "status") await setClientStatus(numericId, action.next);
      else if (action.kind === "freeze") await setClientWithdrawalFreeze(numericId, action.frozen);
      else await unlockClientPin(numericId);

      /* Re-read rather than assume: the panels and the summary both show the
         state the service ended up in, not the state we asked for. */
      const fresh = await getClient(numericId);
      setDetail(fresh);
      setResult(outcomeFor(action, fresh));
      setPending(null);
    } catch (err: unknown) {
      setError(describeError(err, "That action"));
      setPending(null);
    } finally {
      setBusy(false);
    }
  };

  if (!valid) {
    return (
      <Callout tone="error" title="No such customer">
        <Mono>{id}</Mono> is not a customer id. Nothing was read.
      </Callout>
    );
  }

  const user = detail?.user ?? null;
  const limits = detail?.limits ?? null;

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 border-b border-line pb-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="page-title">{user?.fullName ?? "Customer"}</h1>
          <p className="mt-1.5 max-w-xl text-label leading-5 text-ink-faint">
            The whole record on one screen: wallets and limits, every submission and its images,
            recent movements, and the actions available to the desk.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={loading}
            onClick={() => {
              setResult(null);
              load();
            }}
          >
            <Icon name="refresh" className="h-3.5 w-3.5" />
            Reload
          </Button>
          <Link href="/admin/clients">
            <Button size="sm" variant="secondary">
              <Icon name="chevronLeft" className="h-3.5 w-3.5" />
              Clients
            </Button>
          </Link>
        </div>
      </div>

      {loading && !detail ? (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : null}

      <div className="space-y-5">
        {error ? (
          <Callout tone="error" title="This could not be completed">
            {error}
          </Callout>
        ) : null}

        {result ? (
          <Callout tone="success" title="Resulting state">
            {result}
          </Callout>
        ) : null}

        {user ? (
          <Panel title="Customer">
            <div className="flex flex-wrap items-center gap-1.5">
              <Chip tone="neutral">Tier {user.kycTier}</Chip>
              <Chip tone={statusTone(user.status)}>{user.status?.replace(/_/g, " ") ?? "Unknown"}</Chip>
              {user.withdrawalsFrozen ? <Chip tone="negative">Cash-out frozen</Chip> : null}
              {pinLocked(user) ? <Chip tone="negative">PIN locked</Chip> : null}
            </div>
            <dl className="mt-2">
              <SummaryRow label="Customer id" value={`#${user.id}`} mono />
              <SummaryRow label="Email" value={user.email} />
              <SummaryRow label="Since" value={formatDate(user.createdAt)} />
              <SummaryRow
                label="Failed PIN attempts"
                value={<span className="num">{user.failedPinAttempts ?? 0}</span>}
              />
              <SummaryRow
                label="PIN locked until"
                value={user.pinLockedUntil ? formatDateTime(user.pinLockedUntil) : "Not locked"}
              />
            </dl>
          </Panel>
        ) : null}

        {detail ? (
          <Panel title="Wallets and limits">
            <ul className="space-y-3">
              {detail.wallets.map((wallet) => (
                <li
                  key={wallet.currency}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line px-4 py-3"
                >
                  <p className="text-body font-medium">{wallet.currency} wallet</p>
                  <Amount value={wallet.balance} currency={wallet.currency} size="sm" />
                </li>
              ))}
              {detail.wallets.length === 0 ? (
                <li className="text-label text-ink-faint">This customer has no wallets open.</li>
              ) : null}
            </ul>

            {limits ? (
              <dl className="mt-4 border-t border-line pt-2">
                <LimitRow label="Per transaction" value={limits.perTransaction} />
                <LimitRow label="Daily" value={limits.daily} />
                <LimitRow label="Monthly" value={limits.monthly} />
                <LimitRow label="Spent today" value={limits.spentToday} />
                <LimitRow label="Spent this month" value={limits.spentThisMonth} />
                <LimitRow label="Remaining today" value={limits.remainingToday} />
                <div className="py-3">
                  {limits.allowsWithdrawal ? (
                    <Chip tone="positive">
                      <Icon name="check" className="h-3 w-3" />
                      Withdrawals allowed
                    </Chip>
                  ) : (
                    <Chip tone="negative">Withdrawals blocked at this tier</Chip>
                  )}
                </div>
              </dl>
            ) : null}

            <p className="mt-3 border-t border-line pt-3 text-label leading-5 text-ink-faint">
              Limits are set once for the customer from their tier, not per currency, so they carry no
              currency code. Balances above stay in their own currency and are never added together.
            </p>
          </Panel>
        ) : null}

        {detail && detail.kyc.length > 0 ? (
          <Panel
            title="Verification history"
            description="Each submission and the images attached to it. Opening an image is a read, and the audit trail records who did it."
          >
            <ul className="space-y-4">
              {detail.kyc.map((record) => {
                const missing = missingSidesFor(record);
                const stored = DOCUMENT_SIDES.filter((side) => typeof record.sides?.[side] === "number");
                return (
                  <li key={record.recordId} className="rounded-md border border-line px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-body font-medium">{documentTypeLabel(record.documentType)}</p>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <Chip tone="neutral">Tier {record.tier}</Chip>
                        <Chip
                          tone={
                            record.status === "APPROVED"
                              ? "positive"
                              : record.status === "REJECTED"
                                ? "negative"
                                : "muted"
                          }
                        >
                          {record.status}
                        </Chip>
                      </span>
                    </div>
                    <p className="mt-1 text-label text-ink-faint">
                      Submission #<span className="num">{record.recordId}</span> · number ends{" "}
                      <span className="num">•••• {record.last4}</span> · filed{" "}
                      {formatDateTime(record.submittedAt)}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {stored.map((side) => (
                        <DocumentLink
                          key={side}
                          documentId={record.sides[side] as number}
                          label={`View ${SIDE_LABEL[side].toLowerCase()}`}
                          detail={`Document #${record.sides[side]} — ${documentTypeLabel(
                            record.documentType,
                          )}, ${SIDE_LABEL[side].toLowerCase()}.`}
                        />
                      ))}
                      {missing.length > 0 ? (
                        <Chip tone="negative">
                          Missing {missing.map((side) => SIDE_LABEL[side].toLowerCase()).join(", ")}
                        </Chip>
                      ) : (
                        <Chip tone="positive">All required sides on file</Chip>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="mt-4 border-t border-line pt-4">
              <Link
                href="/admin/health?action=KYC_DOCUMENT_VIEWED"
                className="inline-flex items-center gap-1 text-label font-medium uppercase tracking-wide text-ink-muted hover:text-ink"
              >
                Who has opened these images
                <Icon name="chevronRight" className="h-3.5 w-3.5" />
              </Link>
            </div>
          </Panel>
        ) : null}

        {detail && detail.recent.length > 0 ? (
          <Panel title="Recent movements" padded={false}>
            <ul>
              {detail.recent.map((row) => {
                const incoming = row.direction === "IN";
                return (
                  <li
                    key={row.reference}
                    className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3.5 last:border-b-0 sm:px-5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-body font-medium">
                        {row.counterparty?.trim() || row.type.replace(/_/g, " ").toLowerCase()}
                      </p>
                      <p className="mt-0.5 font-mono text-label text-ink-faint">{row.reference}</p>
                      <p className="mt-0.5 text-label text-ink-faint">
                        {formatDateTime(row.occurredAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Amount
                        value={row.amount}
                        currency={row.currency}
                        size="sm"
                        signed={incoming ? "+" : "-"}
                        tone={incoming ? "positive" : "negative"}
                      />
                      <Chip tone={row.status === "COMPLETED" ? "positive" : "muted"}>
                        {row.status}
                      </Chip>
                      {row.reviewFlag ? <Chip tone="negative">Flagged</Chip> : null}
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="px-4 py-3 text-label leading-5 text-ink-faint sm:px-5">
              The reference is what to quote in an audit — the contract gives this client no route for
              the full ledger entries of another customer&rsquo;s movement.
            </p>
          </Panel>
        ) : null}

        {user ? (
          <Panel
            title="Actions"
            description="Each one changes what a real person can do with their money. Nothing happens without a confirmation, and every one is recorded against your account."
          >
            <div className="space-y-4">
              <ActionCard
                title={user.status === "SUSPENDED" ? "Reactivate this account" : "Suspend this account"}
                body={
                  user.status === "SUSPENDED"
                    ? "Sign-in and money movements become allowed again. Tier, limits and balances are untouched."
                    : "This customer cannot sign in or move money at all. Nothing is reversed and nothing is deleted — activity stops where it stands."
                }
                label={user.status === "SUSPENDED" ? "Reactivate" : "Suspend"}
                tone={user.status === "SUSPENDED" ? "secondary" : "danger"}
                disabled={busy || user.status === "CLOSED"}
                onClick={() =>
                  setPending({
                    kind: "status",
                    next: user.status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED",
                  })
                }
              />

              <ActionCard
                title={user.withdrawalsFrozen ? "Lift the cash-out freeze" : "Freeze withdrawals"}
                body={
                  user.withdrawalsFrozen
                    ? "Withdrawals work again. This is the state after a suspicion has been cleared."
                    : "Cash-out stops while transfers and top-ups keep working — the narrower response to a suspicious but unproven account."
                }
                label={user.withdrawalsFrozen ? "Lift the freeze" : "Freeze withdrawals"}
                tone={user.withdrawalsFrozen ? "secondary" : "danger"}
                disabled={busy}
                onClick={() => setPending({ kind: "freeze", frozen: !user.withdrawalsFrozen })}
              />

              <ActionCard
                title="Clear the PIN lockout"
                body={
                  pinLocked(user)
                    ? `Locked since ${formatDateTime(user.pinLockedUntil)} after repeated failures. Clearing it is only honest once the customer has proved themselves to you out of band — the PIN itself does not change and they still have to know it.`
                    : user.failedPinAttempts
                      ? `Not locked, but ${user.failedPinAttempts} failed attempt${
                          user.failedPinAttempts === 1 ? "" : "s"
                        } on record. Clearing resets that count.`
                      : "No lockout and no failed attempts on record, so there is nothing to clear here."
                }
                label="Clear lockout"
                tone="secondary"
                disabled={busy || (!pinLocked(user) && !user.failedPinAttempts)}
                onClick={() => setPending({ kind: "pinUnlock" })}
              />
            </div>
          </Panel>
        ) : null}
      </div>

      <ConfirmAction
        open={pending !== null}
        onClose={() => setPending(null)}
        onConfirm={() => {
          if (pending) void run(pending);
        }}
        busy={busy}
        title={titleFor(pending)}
        tone={toneFor(pending)}
        confirmLabel={titleFor(pending)}
        body={bodyFor(pending)}
        facts={pending?.kind === "pinUnlock" ? pinFacts(user) : accountFacts(user)}
      />
    </>
  );
}

function statusTone(status: string): "positive" | "negative" | "muted" {
  if (status === "ACTIVE") return "positive";
  if (status === "SUSPENDED" || status === "CLOSED") return "negative";
  return "muted";
}

function pinLocked(user: AdminClientUser): boolean {
  if (!user.pinLockedUntil) return false;
  const until = new Date(user.pinLockedUntil).getTime();
  if (Number.isNaN(until)) return true;
  return until > Date.now();
}

function LimitRow({ label, value }: { label: string; value: string }) {
  return (
    <SummaryRow
      label={label}
      value={<Amount value={value} currency={null} size="sm" />}
    />
  );
}

function ActionCard({
  title,
  body,
  label,
  tone,
  disabled,
  onClick,
}: {
  title: string;
  body: string;
  label: string;
  tone: "secondary" | "danger";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <div className="rounded-md border border-line px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-body font-medium">{title}</p>
          <p className="mt-1 max-w-xl text-label leading-5 text-ink-faint">{body}</p>
        </div>
        <Button size="sm" variant={tone} disabled={disabled} onClick={onClick}>
          {label}
        </Button>
      </div>
    </div>
  );
}

function accountFacts(user: AdminClientUser | null): ActionFact[] {
  if (!user) return [];
  return [
    { label: "Customer", value: user.fullName },
    { label: "Email", value: user.email },
    { label: "Status now", value: user.status },
    { label: "Tier now", value: `Tier ${user.kycTier}` },
    { label: "Cash-out", value: user.withdrawalsFrozen ? "Frozen" : "Allowed" },
  ];
}

function pinFacts(user: AdminClientUser | null): ActionFact[] {
  if (!user) return [];
  return [
    { label: "Customer", value: user.fullName },
    { label: "Failed attempts", value: <span className="num">{user.failedPinAttempts ?? 0}</span> },
    {
      label: "Locked until",
      value: user.pinLockedUntil ? formatDateTime(user.pinLockedUntil) : "Not locked",
    },
  ];
}

function titleFor(pending: PendingAction | null): string {
  if (!pending) return "";
  if (pending.kind === "status") {
    return pending.next === "SUSPENDED" ? "Suspend this account" : "Reactivate this account";
  }
  if (pending.kind === "freeze") {
    return pending.frozen ? "Freeze withdrawals" : "Lift the withdrawal freeze";
  }
  return "Clear the PIN lockout";
}

function toneFor(pending: PendingAction | null): "primary" | "danger" {
  if (!pending) return "primary";
  if (pending.kind === "status") return pending.next === "SUSPENDED" ? "danger" : "primary";
  if (pending.kind === "freeze") return pending.frozen ? "danger" : "primary";
  return "primary";
}

function bodyFor(pending: PendingAction | null): string {
  if (!pending) return "";
  if (pending.kind === "status") {
    return pending.next === "SUSPENDED"
      ? "This stops a person signing in and moving money. Balances stay on the ledger exactly as they are."
      : "This restores full access at the account's current tier and limits.";
  }
  if (pending.kind === "freeze") {
    return pending.frozen
      ? "Cash-out stops; transfers and top-ups keep working."
      : "Withdrawals become allowed again, subject to the tier.";
  }
  return "The failed-attempt count is cleared and any lockout lifted, so the customer can authorise with their PIN again.";
}

/** Says back what the service ended up in, not what was asked for. */
function outcomeFor(action: PendingAction, detail: AdminClientDetail): string {
  const { user } = detail;
  if (action.kind === "status") {
    return `${user.fullName} is ${user.status?.replace(/_/g, " ").toLowerCase() ?? "in an unknown state"} (tier ${user.kycTier}). ${
      action.next === "SUSPENDED"
        ? "Sign-in and money movements are blocked."
        : "Sign-in and money movements are allowed again."
    }`;
  }
  if (action.kind === "freeze") {
    return `${user.fullName}: withdrawals ${user.withdrawalsFrozen ? "frozen" : "allowed"} — ${
      action.frozen
        ? "cash-out stops while transfers and top-ups keep working."
        : `cash-out works again at tier ${user.kycTier}.`
    }`;
  }
  return `PIN for ${user.fullName} is no longer locked: ${
    user.failedPinAttempts ?? 0
  } failed attempt(s) on record${user.pinLockedUntil ? `, still locked until ${formatDateTime(user.pinLockedUntil)}` : ""}.`;
}
