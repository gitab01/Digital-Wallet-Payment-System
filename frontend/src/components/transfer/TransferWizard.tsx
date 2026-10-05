"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AbortedError, createTransfer, getQuote } from "@/lib/api";
import { QUOTE_DEBOUNCE_MS } from "@/lib/config";
import { ApiError, describeError, isRetrySafeCode } from "@/lib/errors";
import { formatDateTime, shortRef, toWireAmount, uuid } from "@/lib/money";
import { useDocumentTitle } from "@/lib/useDocumentTitle";
import { validateEmail, validatePin } from "@/lib/validation";
import type { ApiErrorCode, TransferQuote, TransferResult } from "@/lib/types";
import { useWallet } from "@/providers/WalletProvider";
import { PageHeader } from "@/components/AppShell";
import { QuotePanel, type QuoteState } from "@/components/transfer/QuotePanel";
import { Amount } from "@/components/ui/Amount";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Chip } from "@/components/ui/Chip";
import { CopyButton, Mono } from "@/components/ui/Copy";
import { Field, SelectField, SummaryRow } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { PinField } from "@/components/ui/PinField";
import { EmptyState, Panel } from "@/components/ui/Panel";

const STEPS = ["Recipient", "Amount", "Review", "Authorise", "Done"] as const;

type StepIndex = 0 | 1 | 2 | 3 | 4;

/**
 * Five deliberate steps. The amount is typed once, priced live, then frozen: the
 * review screen shows a number the user cannot edit, which forces a visible walk
 * back through the wizard instead of a silent change of mind at the PIN screen.
 *
 * There is no optimistic balance anywhere in here. The number on the confirmation
 * screen is the one the POST returned.
 */
export function TransferWizard() {
  useDocumentTitle("Transfer");

  const { accounts, data, status, refresh } = useWallet();
  const searchParams = useSearchParams();
  const requestedCurrency = searchParams.get("currency")?.toUpperCase() ?? null;

  const [step, setStep] = useState<StepIndex>(0);
  const [currency, setCurrency] = useState<string>(requestedCurrency ?? "");
  const [toEmail, setToEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [amountInput, setAmountInput] = useState("");
  const [amountError, setAmountError] = useState<string | null>(null);
  const [quote, setQuote] = useState<TransferQuote | null>(null);
  const [quoteState, setQuoteState] = useState<QuoteState>("idle");
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitFailure, setSubmitFailure] = useState<string | null>(null);
  const [submitCode, setSubmitCode] = useState<ApiErrorCode | null>(null);
  const [result, setResult] = useState<TransferResult | null>(null);

  /**
   * ONE key for this wizard session. Every retry of the same attempt reuses it, so
   * a double click or a network replay returns the original result (`replayed`)
   * rather than moving money twice.
   */
  const [idempotencyKey, setIdempotencyKey] = useState(() => uuid());
  const quoteSeq = useRef(0);

  const account = useMemo(
    () => accounts.find((candidate) => candidate.currency.toUpperCase() === currency) ?? null,
    [accounts, currency],
  );

  /* Keep the selected source valid once the wallet loads (or a wallet is closed). */
  useEffect(() => {
    if (accounts.length === 0) return;
    const preferred = requestedCurrency
      ? accounts.find((candidate) => candidate.currency.toUpperCase() === requestedCurrency)
      : undefined;
    const target = preferred ?? accounts.find((candidate) => candidate.currency.toUpperCase() === currency);
    if (!target) {
      setCurrency(accounts[0]?.currency.toUpperCase() ?? "");
    } else {
      setCurrency((prev) => (prev === target.currency.toUpperCase() ? prev : target.currency.toUpperCase()));
    }
  }, [accounts, currency, requestedCurrency]);

  const wireAmount = toWireAmount(amountInput);
  const quoteReady = step === 1 && !emailError && wireAmount !== null && Boolean(currency);

  /* Live quote: debounced, and every response is checked against a sequence so a
     slow answer for a superseded amount can never overwrite a newer one. */
  useEffect(() => {
    quoteSeq.current += 1;
    const seq = quoteSeq.current;
    const controller = new AbortController();

    // The amount is frozen once the review step shows it, so the quote that priced it
    // has to survive the step change. Clearing it here left the review panel with
    // nothing to render and the screen went blank.
    if (step > 1) return () => controller.abort();

    if (!quoteReady || !wireAmount) {
      setQuote(null);
      setQuoteState("idle");
      setQuoteError(null);
      return;
    }

    setQuoteState("loading");
    const timer = window.setTimeout(() => {
      getQuote({ toEmail: toEmail.trim(), currency, amount: wireAmount }, controller.signal)
        .then((next) => {
          if (seq !== quoteSeq.current) return;
          setQuote(next);
          setQuoteState("ready");
          setQuoteError(null);
        })
        .catch((err: unknown) => {
          if (err instanceof AbortedError || seq !== quoteSeq.current) return;
          setQuote(null);
          setQuoteState("error");
          setQuoteError(describeError(err, "Quote"));
        });
    }, QUOTE_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [quoteReady, wireAmount, toEmail, currency, step]);

  const goToAmount = useCallback(() => setStep(1), []);
  const goToRecipient = useCallback(() => setStep(0), []);

  const submitRecipient = () => {
    const error = validateEmail(toEmail);
    setEmailError(error);
    if (error) return;
    if (!currency) return;
    setStep(1);
  };

  const submitAmount = () => {
    if (!wireAmount) {
      setAmountError("Enter an amount with up to two decimals.");
      return;
    }
    setAmountError(null);
    if (!quote?.allowed) return;
    setStep(2);
  };

  const locked = submitCode === "PIN_LOCKED";

  const submitTransfer = async () => {
    if (!wireAmount) return;
    const error = validatePin(pin);
    setPinError(error);
    if (error) return;

    setSubmitting(true);
    setSubmitFailure(null);
    setSubmitCode(null);
    try {
      const response = await createTransfer({
        toEmail: toEmail.trim(),
        currency,
        amount: wireAmount,
        pin,
        idempotencyKey,
      });
      setResult(response);
      setStep(4);
      setPin("");
      // Server truth, read back after the POST resolved. Never before.
      await refresh({ silent: true });
    } catch (err) {
      setSubmitFailure(describeError(err, "Transfer"));
      setSubmitCode(err instanceof ApiError ? err.code : null);
    } finally {
      setSubmitting(false);
    }
  };

  const startAnother = () => {
    setStep(0);
    setToEmail("");
    setAmountInput("");
    setQuote(null);
    setQuoteState("idle");
    setQuoteError(null);
    setPin("");
    setPinError(null);
    setSubmitFailure(null);
    setSubmitCode(null);
    setResult(null);
    setEmailError(null);
    setAmountError(null);
    setIdempotencyKey(uuid());
  };

  if (accounts.length === 0) {
    if (status !== "ready") {
      return (
        <>
          <PageHeader title="Transfer" description="Send money to another customer by email." />
          <Panel title="Recipient">
            <p className="text-body text-ink-faint">Loading your accounts…</p>
          </Panel>
        </>
      );
    }
    return (
      <>
        <PageHeader title="Transfer" description="Send money to another customer by email." />
        <EmptyState
          title="You have no wallet to send from"
          body="Open a currency wallet first, then come back to this screen."
          action={
            <Link href="/">
              <Button size="sm">Go to wallet</Button>
            </Link>
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Transfer"
        description="Priced before you commit, authorised with your PIN, and idempotent so a retry cannot pay twice."
      />

      <Stepper step={step} />

      <div className="mt-5 space-y-5 sm:mt-6">
        {step === 0 ? (
          <Panel title="Who are you paying?">
            <form
              className="space-y-5"
              onSubmit={(event) => {
                event.preventDefault();
                submitRecipient();
              }}
            >
              <SelectField
                label="Send from"
                value={currency}
                onChange={setCurrency}
                options={accounts.map((candidate) => ({
                  value: candidate.currency.toUpperCase(),
                  label: `${candidate.currency} · available ${candidate.available}`,
                }))}
                hint="The recipient must hold a wallet in the same currency."
                required
              />
              {account ? (
                <div className="flex items-baseline justify-between gap-4 rounded-md border border-line px-4 py-3">
                  <span className="label">Available in this wallet</span>
                  <Amount value={account.available} currency={account.currency} size="sm" />
                </div>
              ) : null}
              <Field
                label="Recipient email"
                type="email"
                value={toEmail}
                onChange={(value) => {
                  setToEmail(value);
                  setEmailError(null);
                }}
                error={emailError}
                placeholder="bob@example.com"
                inputMode="email"
                autoComplete="off"
                required
              />
              <Button type="submit" block={false} size="lg">
                Continue
                <Icon name="chevronRight" className="h-4 w-4" />
              </Button>
            </form>
          </Panel>
        ) : null}

        {step === 1 ? (
          <Panel
            title="How much?"
            description={`Priced live against ${currency}. Nothing moves yet.`}
            actions={
              <button
                type="button"
                onClick={goToRecipient}
                className="text-label font-medium uppercase tracking-wide text-ink-muted hover:text-ink"
              >
                Change recipient
              </button>
            }
          >
            <div className="space-y-5">
              <Field
                label={`Amount (${currency})`}
                value={amountInput}
                onChange={(value) => {
                  setAmountInput(value);
                  setAmountError(null);
                }}
                inputMode="decimal"
                placeholder="0.00"
                error={amountError}
                hint="Two decimals at most. The fee is charged on top of the amount."
                autoComplete="off"
                required
              />

              <QuotePanel
                state={quoteState}
                quote={quote}
                error={quoteError}
                amount={wireAmount}
                currency={currency}
                dailyCap={data?.limits.daily ?? null}
              />

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button variant="secondary" onClick={goToRecipient}>
                  <Icon name="chevronLeft" className="h-4 w-4" />
                  Back
                </Button>
                <Button
                  block
                  disabled={quoteState !== "ready" || !quote?.allowed || !wireAmount}
                  onClick={submitAmount}
                >
                  Review transfer
                  <Icon name="chevronRight" className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Panel>
        ) : null}

        {step === 2 && quote ? (
          <Panel
            title="Review"
            description="These are the server's numbers, not estimates. The amount is fixed here — go back a step to change it."
          >
            <div className="space-y-5">
              <dl>
                <SummaryRow label="From wallet" value={`${currency} account`} />
                <SummaryRow
                  label="To"
                  value={
                    <span className="flex flex-wrap items-center justify-end gap-2">
                      <span>{quote.recipientName}</span>
                      <span className="font-mono text-label text-ink-faint">{toEmail.trim()}</span>
                    </span>
                  }
                />
                <SummaryRow
                  label="Amount"
                  value={
                    <span className="flex items-center gap-3">
                      <Amount value={wireAmount} currency={currency} size="sm" />
                      <button
                        type="button"
                        onClick={goToAmount}
                        className="text-label font-medium uppercase tracking-wide text-ink-muted underline underline-offset-4 hover:text-ink"
                      >
                        Change
                      </button>
                    </span>
                  }
                />
                <SummaryRow label="Fee" value={<Amount value={quote.fee} currency={currency} size="sm" />} />
                <SummaryRow
                  label="Total leaving your wallet"
                  value={
                    <Amount value={quote.totalDebit} currency={currency} size="sm" signed="-" tone="negative" />
                  }
                />
                <SummaryRow
                  label="Your balance after"
                  value={<Amount value={quote.senderBalanceAfter} currency={currency} size="sm" />}
                />
                <SummaryRow
                  label="Capacity left today"
                  value={<Amount value={quote.remainingToday} currency={null} size="sm" />}
                />
              </dl>

              <Callout tone="pending" title="Not sent yet">
                Enter your PIN next. If your session has expired in the meantime you will be asked to
                prove it again before this is sent.
              </Callout>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button variant="secondary" onClick={goToAmount}>
                  <Icon name="chevronLeft" className="h-4 w-4" />
                  Back
                </Button>
                <Button block onClick={() => setStep(3)}>
                  Continue to PIN
                  <Icon name="chevronRight" className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Panel>
        ) : null}

        {step === 3 ? (
          <Panel title="Authorise" description="One movement, one attempt, one idempotency key.">
            <form
              className="space-y-5"
              onSubmit={(event) => {
                event.preventDefault();
                void submitTransfer();
              }}
            >
              <div className="rounded-md border border-line px-4 py-3">
                <p className="label">You are sending</p>
                <div className="mt-1 flex flex-wrap items-baseline justify-between gap-3">
                  <Amount value={wireAmount} currency={currency} size="md" />
                  <span className="text-label text-ink-faint">
                    Fee <Amount value={quote?.fee ?? null} currency={currency} size="xs" /> · total debit{" "}
                    <Amount value={quote?.totalDebit ?? null} currency={currency} size="xs" signed="-" />
                  </span>
                </div>
              </div>

              <PinField
                label="Your PIN"
                value={pin}
                onChange={(value) => {
                  setPin(value);
                  setPinError(null);
                }}
                error={pinError}
                disabled={submitting || locked}
                autoFocus
                autoComplete="off"
              />

              {submitFailure ? (
                <Callout tone="error" title="This transfer was not completed" code={submitCode ?? undefined}>
                  {submitFailure}
                  <p className="text-ink-faint">
                    {isRetrySafeCode(submitCode)
                      ? "Re-sending this attempt is safe: it carries the same idempotency key, so the server will not move the money twice."
                      : "Sending it again as it stands will be refused again — change what the message above asks for first."}
                  </p>
                </Callout>
              ) : null}

              {submitting ? (
                <Callout tone="pending" title="Sending — hold on" >
                  The balance on your wallet screen will not move until the ledger confirms this. A
                  slow response is not a failure: keep this page open.
                </Callout>
              ) : null}

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setStep(2)}
                  disabled={submitting}
                >
                  <Icon name="chevronLeft" className="h-4 w-4" />
                  Back
                </Button>
                <Button
                  type="submit"
                  block
                  size="lg"
                  loading={submitting}
                  disabled={submitting || locked || pin.length !== 4}
                >
                  {submitFailure ? "Retry transfer" : "Send transfer"}
                </Button>
              </div>

              <p className="text-label leading-5 text-ink-faint">
                Retrying reuses the same key —{" "}
                <span className="font-mono">{shortRef(idempotencyKey)}</span> — so a duplicate
                submission returns the original result instead of paying twice.
              </p>
            </form>
          </Panel>
        ) : null}

        {step === 4 && result ? (
          <Panel title="Transfer sent">
            <div className="space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
                <div>
                  <p className="label">Reference</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-3">
                    <Mono className="text-body font-semibold text-ink">{result.reference}</Mono>
                    <CopyButton value={result.reference} label="Copy reference" />
                  </div>
                  <p className="mt-2 text-label leading-5 text-ink-faint">
                    Quote this reference in any dispute. It identifies the ledger movement, not this
                    screen.
                  </p>
                </div>
                <div className="text-right">
                  <Amount
                    value={result.amount}
                    currency={result.currency}
                    size="lg"
                    signed="-"
                    tone="negative"
                  />
                  <p className="mt-1">
                    <Chip tone={result.status === "COMPLETED" ? "positive" : "muted"}>
                      {result.status}
                    </Chip>
                  </p>
                </div>
              </div>

              {result.replayed ? (
                <Callout tone="info" title="This is the result of your earlier attempt">
                  The service recognised idempotency key{" "}
                  <span className="font-mono">{shortRef(idempotencyKey)}</span> and replayed the
                  original outcome. No second payment was made.
                </Callout>
              ) : null}

              {result.reviewFlag ? (
                <Callout tone="error" title="Flagged for review">
                  This movement was picked up by the anomaly rules. It is recorded in the ledger, and
                  operations will review it. The reference above is what they will ask for.
                </Callout>
              ) : null}

              <dl>
                <SummaryRow
                  label="Recipient"
                  value={result.recipientName ?? toEmail.trim()}
                />
                <SummaryRow label="Fee" value={<Amount value={result.fee} currency={result.currency} size="sm" />} />
                <SummaryRow
                  label="Your balance now"
                  value={<Amount value={result.senderBalance} currency={result.currency} size="sm" />}
                />
                <SummaryRow label="Committed" value={formatDateTime(result.occurredAt)} />
              </dl>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Link href={`/transactions/${encodeURIComponent(result.reference)}`} className="flex-1">
                  <Button block variant="secondary" className="w-full">
                    View the movement
                  </Button>
                </Link>
                <Button block onClick={startAnother}>
                  Start another transfer
                </Button>
              </div>
              <Link href="/" className="inline-block text-label uppercase tracking-wide text-ink-muted hover:text-ink">
                Back to wallet
              </Link>
            </div>
          </Panel>
        ) : null}
      </div>
    </>
  );
}

function Stepper({ step }: { step: StepIndex }) {
  return (
    <ol
      aria-label="Transfer progress"
      className="flex items-stretch gap-1 overflow-x-auto no-scrollbar border-b border-line pb-3 sm:gap-2"
    >
      {STEPS.map((label, index) => {
        const done = index < step;
        const current = index === step;
        return (
          <li
            key={label}
            aria-current={current ? "step" : undefined}
            className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-label uppercase tracking-wide ${
              current
                ? "border-ink font-semibold text-ink"
                : done
                  ? "border-line text-ink-muted"
                  : "border-line text-ink-faint"
            }`}
          >
            <span className="num">{done ? "✓" : index + 1}</span>
            <span className="hidden sm:inline">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
