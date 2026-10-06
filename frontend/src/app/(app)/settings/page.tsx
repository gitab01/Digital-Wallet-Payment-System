"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { changePin, getAuditEvents, getKyc, submitKycUpgrade } from "@/lib/api";
import { ApiError, describeError } from "@/lib/errors";
import { missingSidesFor } from "@/lib/kyc";
import { formatDateTime } from "@/lib/money";
import { useDocumentTitle } from "@/lib/useDocumentTitle";
import {
  validateCountry,
  validateDateOfBirth,
  validateDocumentNumber,
  validatePhone,
  validatePin,
} from "@/lib/validation";
import {
  DOCUMENT_TYPES,
  documentTypeLabel,
  requiredSidesFor,
  type AuditEvent,
  type DocumentSide,
  type DocumentType,
  type KycView,
  type Money,
} from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";
import { useWallet } from "@/providers/WalletProvider";
import { useToast } from "@/providers/ToastProvider";
import { PageHeader } from "@/components/AppShell";
import { AmountBare } from "@/components/ui/Amount";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Chip } from "@/components/ui/Chip";
import { Field, SelectField, SummaryRow } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { PinField } from "@/components/ui/PinField";
import { Panel, Skeleton } from "@/components/ui/Panel";

const DOCUMENT_OPTIONS = DOCUMENT_TYPES.map((value) => ({
  value,
  label: documentTypeLabel(value),
}));

const SIDE_LABEL: Record<DocumentSide, string> = {
  FRONT: "Front",
  BACK: "Back",
};

export default function SettingsPage() {
  useDocumentTitle("Settings");

  const { user, email, signOut } = useAuth();
  const { data } = useWallet();

  const [kyc, setKyc] = useState<KycView | null>(null);
  const [kycError, setKycError] = useState<string | null>(null);
  const [kycLoading, setKycLoading] = useState(true);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [eventsLoading, setEventsLoading] = useState(true);

  const loadKyc = useCallback(() => {
    setKycLoading(true);
    getKyc()
      .then((view) => {
        setKyc(view);
        setKycError(null);
      })
      .catch((err: unknown) => setKycError(describeError(err, "Verification")))
      .finally(() => setKycLoading(false));
  }, []);

  const loadEvents = useCallback(() => {
    setEventsLoading(true);
    getAuditEvents()
      .then((page) => {
        setEvents(page.items ?? []);
        setEventsError(null);
      })
      .catch((err: unknown) => setEventsError(describeError(err, "Security events")))
      .finally(() => setEventsLoading(false));
  }, []);

  useEffect(() => {
    loadKyc();
    loadEvents();
  }, [loadKyc, loadEvents]);

  return (
    <>
      <PageHeader
        title="Settings"
        description="Your PIN, verification tier, the limits it carries, and the security events recorded against this account."
      />

      <div className="space-y-5">
        <Panel title="Account">
          <dl>
            <SummaryRow label="Name" value={user?.fullName ?? "—"} />
            <SummaryRow label="Email" value={user?.email ?? email ?? "—"} />
            <SummaryRow
              label="Customer id"
              value={user ? `#${user.id}` : "—"}
              mono
            />
            <SummaryRow
              label="Status"
              value={
                <Chip tone={user?.status === "ACTIVE" ? "positive" : "muted"}>
                  {user?.status?.replace(/_/g, " ") ?? "Unknown"}
                </Chip>
              }
            />
            <SummaryRow
              label="Verified tier"
              value={
                <span className="flex items-center justify-end gap-2">
                  <Chip tone="neutral">Tier {kyc?.tier ?? data?.tier ?? "—"}</Chip>
                  {kyc ? (
                    <span className="text-label uppercase tracking-wide text-ink-faint">
                      {kyc.status}
                    </span>
                  ) : null}
                </span>
              }
            />
          </dl>
          <div className="mt-4 border-t border-line pt-4">
            <Button size="sm" variant="secondary" onClick={() => void signOut()}>
              <Icon name="logout" className="h-4 w-4" />
              Sign out
            </Button>
          </div>
        </Panel>

        <PinChangePanel />

        <Panel
          title="Verification and limits"
          description="Limits are set by the service from your tier — they are not adjustable here."
          actions={
            <Button size="sm" variant="secondary" onClick={loadKyc} disabled={kycLoading}>
              Reload
            </Button>
          }
        >
          {kycLoading && !kyc ? (
            <Skeleton className="h-40 w-full" />
          ) : kycError ? (
            <Callout tone="error">{kycError}</Callout>
          ) : kyc ? (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone="neutral">Tier {kyc.tier}</Chip>
                <Chip tone={kyc.status === "APPROVED" ? "positive" : kyc.status === "REJECTED" ? "negative" : "muted"}>
                  {kyc.status}
                </Chip>
                {kyc.nextTier !== null ? (
                  <span className="text-label text-ink-faint">Next available tier: {kyc.nextTier}</span>
                ) : null}
              </div>

              <dl>
                <SummaryRow label="Submitted" value={formatDateTime(kyc.submittedAt)} />
                <SummaryRow label="Reviewed" value={formatDateTime(kyc.reviewedAt)} />
              </dl>

              <LimitGrid limits={kyc.limits} fallback={data?.limits ?? null} />

              {kyc.documents.length > 0 ? (
                <div>
                  <p className="label mb-2">Documents on file</p>
                  <ul className="space-y-2">
                    {kyc.documents.map((document) => {
                      const missing = missingSidesFor(document);
                      return (
                        <li
                          key={document.recordId}
                          className="rounded-md border border-line px-4 py-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <p className="text-body font-medium">
                              {documentTypeLabel(document.documentType)}
                            </p>
                            <Chip
                              tone={
                                document.status === "APPROVED"
                                  ? "positive"
                                  : document.status === "REJECTED"
                                    ? "negative"
                                    : "muted"
                              }
                            >
                              {document.status}
                            </Chip>
                          </div>
                          <p className="mt-0.5 text-label text-ink-faint">
                            Tier {document.tier} · ends {document.last4} · submitted{" "}
                            {formatDateTime(document.submittedAt)}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            {requiredSidesFor(document.documentType).map((side) => {
                              const storedId = document.sides?.[side] ?? null;
                              return (
                                <Chip key={side} tone={storedId ? "positive" : "negative"}>
                                  {SIDE_LABEL[side]}
                                  {storedId ? (
                                    <>
                                      {" on file "}
                                      <span className="num">#{storedId}</span>
                                    </>
                                  ) : (
                                    " missing"
                                  )}
                                </Chip>
                              );
                            })}
                          </div>
                          {missing.length > 0 && document.status === "SUBMITTED" ? (
                            <Link
                              href="/verify"
                              className="mt-2 inline-flex items-center gap-1 text-label font-medium uppercase tracking-wide text-ink-muted hover:text-ink"
                            >
                              Photograph the {missing.map((side) => SIDE_LABEL[side].toLowerCase()).join(" and ")}
                              <Icon name="chevronRight" className="h-3.5 w-3.5" />
                            </Link>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}

              {kyc.nextTier !== null ? <KycUpgradePanel onSubmitted={loadKyc} /> : null}
            </div>
          ) : (
            <p className="text-body text-ink-faint">No verification record found.</p>
          )}
        </Panel>

        <Panel
          title="Recent security events"
          description="Sign-ins, PIN failures, limit breaches and movements."
          actions={
            <Button size="sm" variant="secondary" onClick={loadEvents} disabled={eventsLoading}>
              Reload
            </Button>
          }
        >
          {eventsError ? <Callout tone="error">{eventsError}</Callout> : null}
          {eventsLoading && events.length === 0 ? (
            <div className="space-y-2">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : events.length === 0 && !eventsError ? (
            <p className="text-body text-ink-faint">Nothing recorded yet.</p>
          ) : (
            <ul className="space-y-2">
              {events.map((event, index) => (
                <li
                  key={`${event.createdAt}-${event.action}-${index}`}
                  className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3 last:border-b-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="text-body font-medium">{event.action.replace(/_/g, " ")}</p>
                    <p className="mt-0.5 text-label text-ink-faint">
                      {event.detail ?? "No further detail recorded"}
                    </p>
                  </div>
                  <div className="text-right">
                    <Chip tone={event.outcome === "SUCCESS" ? "positive" : "negative"}>
                      {event.outcome}
                    </Chip>
                    <p className="num mt-1 text-label text-ink-faint">
                      {formatDateTime(event.createdAt)}
                    </p>
                    {event.ipAddress ? (
                      <p className="font-mono text-label text-ink-faint">{event.ipAddress}</p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}

function PinChangePanel() {
  const { push } = useToast();
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [errors, setErrors] = useState<{ current?: string | null; next?: string | null; confirm?: string | null }>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const nextErrors = {
      current: validatePin(currentPin, "Current PIN"),
      next: validatePin(newPin, "New PIN"),
      confirm:
        validatePin(confirmPin, "Confirmation PIN") ??
        (confirmPin === newPin ? null : "The two new PINs do not match."),
    };
    const sameAsCurrent = newPin && currentPin && newPin === currentPin;
    setErrors({
      ...nextErrors,
      next: nextErrors.next ?? (sameAsCurrent ? "Choose a PIN different from your current one." : null),
    });
    if (nextErrors.current || nextErrors.next || nextErrors.confirm || sameAsCurrent) return;

    setBusy(true);
    setFailure(null);
    try {
      await changePin({ currentPin, newPin });
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
      push({
        tone: "success",
        title: "PIN changed",
        body: "Use the new PIN for your next movement.",
      });
    } catch (err) {
      setFailure(describeError(err, "Changing your PIN"));
      if (err instanceof ApiError && (err.code === "PIN_INVALID" || err.code === "PIN_LOCKED")) {
        setCurrentPin("");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Change your PIN" description="Authorises every outbound movement of money.">
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="grid gap-5 sm:grid-cols-3">
          <PinField
            label="Current PIN"
            value={currentPin}
            onChange={setCurrentPin}
            error={errors.current}
            disabled={busy}
            autoComplete="off"
          />
          <PinField
            label="New PIN"
            value={newPin}
            onChange={setNewPin}
            error={errors.next}
            disabled={busy}
            autoComplete="off"
          />
          <PinField
            label="Repeat new PIN"
            value={confirmPin}
            onChange={setConfirmPin}
            error={errors.confirm}
            disabled={busy}
            autoComplete="off"
          />
        </div>

        {failure ? <Callout tone="error">{failure}</Callout> : null}

        <Button type="submit" block={false} loading={busy} disabled={busy}>
          Update PIN
        </Button>
      </form>
    </Panel>
  );
}

function LimitGrid({ limits, fallback }: { limits: KycView["limits"]; fallback: KycView["limits"] | null }) {
  const shown: KycView["limits"] = limits ?? fallback ?? {
    perTransaction: "0.00",
    daily: "0.00",
    monthly: "0.00",
    spentToday: "0.00",
    spentThisMonth: "0.00",
    remainingToday: "0.00",
    allowsWithdrawal: false,
  };

  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-4 rounded-md border border-line p-4 sm:grid-cols-3">
      <LimitCell label="Per transaction" value={shown.perTransaction} />
      <LimitCell label="Daily" value={shown.daily} />
      <LimitCell label="Monthly" value={shown.monthly} />
      <LimitCell label="Spent today" value={shown.spentToday} />
      <LimitCell label="Spent this month" value={shown.spentThisMonth} />
      <LimitCell label="Remaining today" value={shown.remainingToday} />
      <div className="col-span-2 sm:col-span-3">
        {shown.allowsWithdrawal ? (
          <Chip tone="positive">
            <Icon name="check" className="h-3 w-3" />
            Withdrawals allowed
          </Chip>
        ) : (
          <Chip tone="negative">Withdrawals blocked at this tier</Chip>
        )}
      </div>
    </dl>
  );
}

function LimitCell({ label, value }: { label: string; value: Money }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className="mt-1">
        <AmountBare value={value} className="text-body" />
      </dd>
    </div>
  );
}

function KycUpgradePanel({ onSubmitted }: { onSubmitted: () => void }) {
  const { push } = useToast();
  const [documentType, setDocumentType] = useState<string>("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [country, setCountry] = useState("");
  const [errors, setErrors] = useState<Record<string, string | null | undefined>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const nextErrors = {
      documentType: documentType ? null : "Select the document you are submitting.",
      documentNumber: validateDocumentNumber(documentNumber),
      phone: validatePhone(phone),
      dateOfBirth: validateDateOfBirth(dateOfBirth),
      country: validateCountry(country),
    };
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;

    setBusy(true);
    setFailure(null);
    try {
      await submitKycUpgrade({
        documentType: documentType as DocumentType,
        documentNumber: documentNumber.trim().toUpperCase(),
        phone: phone.trim(),
        dateOfBirth,
        country: country.trim().toUpperCase(),
      });
      push({
        tone: "success",
        title: "Upgrade submitted",
        body: "Operations will review it and your limits change once it is approved.",
      });
      setDocumentType("");
      setDocumentNumber("");
      onSubmitted();
    } catch (err) {
      setFailure(describeError(err, "Verification upgrade"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="space-y-5 border-t border-line pt-5"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <p className="text-body font-medium">Request a higher tier</p>
      <p className="text-label leading-5 text-ink-faint">
        Submitting another document raises your limits once it is approved. Until then every limit
        above stays exactly as it is.
      </p>

      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField
          label="Document type"
          value={documentType}
          options={DOCUMENT_OPTIONS}
          onChange={setDocumentType}
          placeholder="Select a document"
          error={errors.documentType}
          required
        />
        <Field
          label="Document number"
          value={documentNumber}
          onChange={(value) => setDocumentNumber(value.toUpperCase())}
          maxLength={20}
          error={errors.documentNumber}
          required
        />
        <Field
          label="Phone"
          type="tel"
          value={phone}
          onChange={setPhone}
          inputMode="tel"
          error={errors.phone}
          required
        />
        <Field
          label="Date of birth"
          type="date"
          value={dateOfBirth}
          onChange={setDateOfBirth}
          error={errors.dateOfBirth}
          required
        />
        <Field
          label="Country"
          value={country}
          onChange={(value) => setCountry(value.toUpperCase())}
          maxLength={2}
          placeholder="ET"
          error={errors.country}
          required
        />
      </div>

      {failure ? <Callout tone="error">{failure}</Callout> : null}

      <Button type="submit" loading={busy} disabled={busy}>
        Submit for review
      </Button>
    </form>
  );
}
