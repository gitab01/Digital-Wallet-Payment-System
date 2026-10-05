"use client";

import { useState } from "react";
import Link from "next/link";

import { openAccount } from "@/lib/api";
import { describeError } from "@/lib/errors";
import { formatClock, ratioOf } from "@/lib/money";
import { useDocumentTitle } from "@/lib/useDocumentTitle";
import { KNOWN_CURRENCIES, type LimitSummary, type WalletAccount } from "@/lib/types";
import { useWallet } from "@/providers/WalletProvider";
import { useToast } from "@/providers/ToastProvider";
import { AccountCard } from "@/components/AccountCard";
import { FundingDialog } from "@/components/FundingDialog";
import { PageHeader } from "@/components/AppShell";
import { TransactionRowItem } from "@/components/TransactionRowItem";
import { Amount, AmountBare } from "@/components/ui/Amount";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Chip } from "@/components/ui/Chip";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState, Panel, Skeleton } from "@/components/ui/Panel";
import { SelectField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";

export default function WalletHomePage() {
  useDocumentTitle("Wallet");

  const { data, status, error, refreshing, lastUpdated, refresh } = useWallet();
  const [funding, setFunding] = useState<{ mode: "deposit" | "withdraw"; account: WalletAccount } | null>(
    null,
  );
  const [addingCurrency, setAddingCurrency] = useState(false);

  const limits = data?.limits;
  const ownedCurrencies = new Set((data?.accounts ?? []).map((account) => account.currency));
  const openers = [...new Set(KNOWN_CURRENCIES.map((code) => code.toUpperCase()))].filter(
    (code) => !ownedCurrencies.has(code),
  );

  if (status === "loading" && !data) {
    return (
      <>
        <PageHeader title="Wallet" description="Loading your accounts and limits." />
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Skeleton className="h-56 w-full" />
            <Skeleton className="h-56 w-full" />
            <Skeleton className="h-56 w-full" />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Wallet"
        description="Tier limits apply across every currency account. Balances are read from the ledger projection and only ever change after the server says so."
        actions={
          <>
            <RefreshControl
              refreshing={refreshing}
              lastUpdated={lastUpdated}
              onRefresh={() => void refresh()}
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setAddingCurrency(true)}
              trailing={<Icon name="plus" className="h-3.5 w-3.5" />}
            >
              Add currency
            </Button>
          </>
        }
      />

      <div className="space-y-5 sm:space-y-6">
        {error ? (
          <Callout
            tone="error"
            title="We could not read your wallet"
            action={
              <Button size="sm" variant="secondary" onClick={() => void refresh()}>
                Try again
              </Button>
            }
          >
            {error}
          </Callout>
        ) : null}

        {data?.withdrawalsFrozen ? (
          <Callout tone="error" title="Withdrawals are frozen">
            You can still receive money and move it between your own currency wallets. Deposits are
            unaffected. Contact support to lift the freeze.
          </Callout>
        ) : null}

        {limits ? <DailyCapacity limits={limits} tier={data?.tier ?? null} /> : null}

        {data && data.accounts.length === 0 ? (
          <EmptyState
            title="No currency wallets yet"
            body="Open your first wallet to start receiving and sending money."
            action={
              <Button size="sm" onClick={() => setAddingCurrency(true)}>
                Open a wallet
              </Button>
            }
          />
        ) : null}

        {data && data.accounts.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.accounts.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                remainingToday={limits?.remainingToday ?? "0.00"}
                allowsWithdrawal={limits?.allowsWithdrawal ?? false}
                withdrawalsFrozen={data.withdrawalsFrozen}
                onDeposit={() => setFunding({ mode: "deposit", account })}
                onWithdraw={() => setFunding({ mode: "withdraw", account })}
              />
            ))}
          </div>
        ) : null}

        <Panel
          title="Recent activity"
          description="The last movements committed to the ledger."
          actions={
            <Link
              href="/history"
              className="text-label font-medium uppercase tracking-wide text-ink-muted hover:text-ink"
            >
              View all
            </Link>
          }
          padded={false}
        >
          {data && data.recent.length > 0 ? (
            <ul>
              {data.recent.slice(0, 8).map((row) => (
                <TransactionRowItem key={row.reference} row={row} />
              ))}
            </ul>
          ) : (
            <div className="p-4 sm:p-5">
              <EmptyState
                title="No movements yet"
                body="Transfers, deposits and withdrawals will appear here as soon as the ledger commits them."
                action={
                  <Link href="/transfer">
                    <Button size="sm" variant="secondary">
                      Make a transfer
                    </Button>
                  </Link>
                }
              />
            </div>
          )}
        </Panel>
      </div>

      {funding ? (
        <FundingDialog
          mode={funding.mode}
          account={funding.account}
          onClose={() => setFunding(null)}
        />
      ) : null}

      <AddCurrencyDialog
        open={addingCurrency}
        candidates={openers}
        onClose={() => setAddingCurrency(false)}
      />
    </>
  );
}

/** The non-negotiable control: numbers never move without the user asking. */
function RefreshControl({
  refreshing,
  lastUpdated,
  onRefresh,
}: {
  refreshing: boolean;
  lastUpdated: Date | null;
  onRefresh: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="num text-label text-ink-faint">
        {lastUpdated ? `Synced ${formatClock(lastUpdated)}` : "Not synced"}
      </span>
      <Button
        size="sm"
        variant="secondary"
        onClick={onRefresh}
        loading={refreshing}
        trailing={<Icon name="refresh" className="h-3.5 w-3.5" />}
        aria-label="Refresh wallet balances"
      >
        Refresh
      </Button>
    </div>
  );
}

function DailyCapacity({ limits, tier }: { limits: LimitSummary; tier: number | null }) {
  const usedToday = ratioOf(limits.spentToday, limits.daily) ?? 0;
  const usedMonth = ratioOf(limits.spentThisMonth, limits.monthly) ?? 0;
  const nearCap = usedToday > 0.8;

  return (
    <Panel
      title="Daily capacity"
      actions={tier !== null ? <Chip tone="neutral">Tier {tier}</Chip> : undefined}
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="label">Remaining today</p>
            <Amount value={limits.remainingToday} currency={null} size="lg" className="mt-1" />
          </div>
          <dl className="grid w-full grid-cols-3 gap-x-4 gap-y-2 text-right sm:w-auto sm:gap-x-6">
            <Stat label="Spent today" value={limits.spentToday} />
            <Stat label="Daily cap" value={limits.daily} />
            <Stat label="Per transfer" value={limits.perTransaction} />
          </dl>
        </div>

        <div>
          <div className="h-2 w-full overflow-hidden rounded-full border border-line">
            <div
              className={`h-full rounded-full ${nearCap ? "bg-debit" : "bg-ink"}`}
              style={{ width: `${Math.round(usedToday * 100)}%` }}
              role="progressbar"
              aria-valuenow={Math.round(usedToday * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Share of the daily limit used"
            />
          </div>
          <p className="mt-2 flex flex-wrap justify-between gap-2 text-label text-ink-faint">
            <span>{Math.round(usedToday * 100)}% of today's limit used</span>
            <span>{Math.round(usedMonth * 100)}% of the monthly limit used</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          {limits.allowsWithdrawal ? (
            <Chip tone="positive">
              <Icon name="check" className="h-3 w-3" />
              Withdrawals allowed
            </Chip>
          ) : (
            <Chip tone="negative">Withdrawals blocked at this tier</Chip>
          )}
          <Link
            href="/settings"
            className="text-label font-medium uppercase tracking-wide text-ink-muted hover:text-ink"
          >
            Tier and limits
          </Link>
        </div>

        <p className="text-label leading-5 text-ink-faint">
          Limits are set once for the customer, not per currency account, so the figures above carry
          no currency code.
        </p>
      </div>
    </Panel>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className="mt-0.5">
        <AmountBare value={value} className="text-body" />
      </dd>
    </div>
  );
}

function AddCurrencyDialog({
  open,
  candidates,
  onClose,
}: {
  open: boolean;
  candidates: string[];
  onClose: () => void;
}) {
  const { refresh } = useWallet();
  const { push } = useToast();
  const [currency, setCurrency] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const submit = async () => {
    if (!currency) return;
    setBusy(true);
    setFailure(null);
    try {
      const account = await openAccount(currency);
      await refresh({ silent: true });
      push({ tone: "success", title: `${account.currency} wallet opened`, body: `Account ${account.id}` });
      setCurrency("");
      onClose();
    } catch (err) {
      setFailure(describeError(err, "Opening the wallet"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Open a currency wallet"
      description="One wallet per currency per customer."
    >
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <SelectField
          label="Currency"
          value={currency}
          onChange={setCurrency}
          options={
            candidates.length > 0
              ? candidates.map((code) => ({ value: code, label: code }))
              : [{ value: "", label: "All supported currencies are open" }]
          }
          placeholder="Choose a currency"
          disabled={busy || candidates.length === 0}
          hint="Supported by the service today: ETB, USD, EUR."
        />
        {failure ? <Callout tone="error">{failure}</Callout> : null}
        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <Button type="submit" block disabled={!currency || busy} loading={busy}>
            Open wallet
          </Button>
          <Button variant="secondary" block onClick={onClose} disabled={busy}>
            Cancel
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
