"use client";

import { useEffect, useMemo, useState } from "react";

import { deposit, withdraw } from "@/lib/api";
import { describeError } from "@/lib/errors";
import { formatDateTime, toWireAmount, uuid } from "@/lib/money";
import { validateAmountInput, validatePin } from "@/lib/validation";
import type { TransferResult, WalletAccount } from "@/lib/types";
import { useWallet } from "@/providers/WalletProvider";
import { useToast } from "@/providers/ToastProvider";
import { Amount } from "@/components/ui/Amount";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Dialog } from "@/components/ui/Dialog";
import { Field, SummaryRow } from "@/components/ui/Field";
import { PinField } from "@/components/ui/PinField";

/**
 * Simulated funding rails. Same discipline as a transfer: one idempotency key per
 * dialog session, and the balance only changes after the POST has returned.
 */
export function FundingDialog({
  mode,
  account,
  onClose,
}: {
  mode: "deposit" | "withdraw";
  account: WalletAccount | null;
  onClose: () => void;
}) {
  const { refresh } = useWallet();
  const { push } = useToast();
  const [amount, setAmount] = useState("");
  const [pin, setPin] = useState("");
  const [errors, setErrors] = useState<{ amount?: string | null; pin?: string | null }>({});
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [result, setResult] = useState<TransferResult | null>(null);

  // One key for the whole dialog session: a double click or a network retry
  // replays the original attempt instead of moving money twice.
  const idempotencyKey = useMemo(() => uuid(), [account?.id, mode]);

  useEffect(() => {
    setAmount("");
    setPin("");
    setErrors({});
    setFailure(null);
    setResult(null);
    setSubmitting(false);
  }, [account?.id, mode]);

  const open = account !== null;
  const title = mode === "deposit" ? "Add money" : "Withdraw money";

  if (!account) return null;

  const submit = async () => {
    const wire = toWireAmount(amount);
    const nextErrors = {
      amount: validateAmountInput(amount),
      pin: validatePin(pin),
    };
    setErrors(nextErrors);
    if (nextErrors.amount || nextErrors.pin || !wire) return;

    setFailure(null);
    setSubmitting(true);
    try {
      const body = { currency: account.currency, amount: wire, pin, idempotencyKey };
      const response = mode === "deposit" ? await deposit(body) : await withdraw(body);
      setResult(response);
      // Server truth, re-read — not the number the POST happened to echo.
      await refresh({ silent: true });
      push({
        tone: "success",
        title: `${mode === "deposit" ? "Deposit" : "Withdrawal"} ${response.status.toLowerCase()}`,
        body: `${response.reference} · new balance ${response.senderBalance} ${response.currency}`,
      });
    } catch (err) {
      setFailure(describeError(err, mode));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dismissable={!submitting}
      title={result ? `${title} complete` : title}
      description={`${account.label} · ${account.currency}`}
    >
      {result ? (
        <div className="space-y-5">
          <dl className="space-y-0">
            <SummaryRow label="Amount" value={<Amount value={result.amount} currency={result.currency} size="sm" />} />
            <SummaryRow
              label={mode === "deposit" ? "Money in" : "Money out"}
              value={<Amount value={result.amount} currency={result.currency} size="sm" signed={mode === "deposit" ? "+" : "-"} tone={mode === "deposit" ? "positive" : "negative"} />}
            />
            {result.fee !== "0.00" ? (
              <SummaryRow label="Fee" value={<Amount value={result.fee} currency={result.currency} size="sm" />} />
            ) : null}
            <SummaryRow label="Balance after" value={<Amount value={result.senderBalance} currency={result.currency} size="sm" />} />
            <SummaryRow label="Reference" value={result.reference} mono />
            <SummaryRow label="Completed" value={formatDateTime(result.occurredAt)} />
          </dl>
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button block onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="rounded-md border border-line px-4 py-3">
            <p className="label">Current balance</p>
            <Amount value={account.balance} currency={account.currency} size="md" className="mt-1" />
          </div>

          <Field
            label="Amount"
            value={amount}
            onChange={setAmount}
            inputMode="decimal"
            placeholder="0.00"
            error={errors.amount}
            hint={`Up to two decimals. Your remaining daily capacity is shown on the wallet screen.`}
            required
            autoComplete="off"
          />

          <PinField
            label="Your PIN"
            value={pin}
            onChange={setPin}
            error={errors.pin}
            disabled={submitting}
            autoComplete="off"
          />

          {failure ? <Callout tone="error">{failure}</Callout> : null}

          {submitting ? (
            <Callout tone="pending" title="Sending — do not close this window">
              We wait for the server to confirm before any number on your screen changes.
            </Callout>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button type="submit" block loading={submitting} disabled={submitting}>
              {mode === "deposit" ? "Confirm deposit" : "Confirm withdrawal"}
            </Button>
            <Button variant="secondary" block onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
          </div>

          <p className="font-mono text-label text-ink-faint">
            Idempotency key {idempotencyKey.slice(0, 8)}…{idempotencyKey.slice(-4)}
          </p>
        </form>
      )}
    </Dialog>
  );
}
