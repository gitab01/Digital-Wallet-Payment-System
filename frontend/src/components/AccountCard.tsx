"use client";

import Link from "next/link";

import type { Money, WalletAccount } from "@/lib/types";
import { formatDateTime } from "@/lib/money";
import { Amount, AmountBare } from "@/components/ui/Amount";
import { Button } from "@/components/ui/Button";
import { VerifiedChip } from "@/components/ui/Chip";
import { Icon } from "@/components/ui/Icon";

export function AccountCard({
  account,
  remainingToday,
  allowsWithdrawal,
  withdrawalsFrozen,
  onDeposit,
  onWithdraw,
}: {
  account: WalletAccount;
  remainingToday: Money;
  allowsWithdrawal: boolean;
  withdrawalsFrozen: boolean;
  onDeposit: () => void;
  onWithdraw: () => void;
}) {
  const reserved = account.available !== account.balance;
  const canWithdraw = allowsWithdrawal && !withdrawalsFrozen;

  return (
    <article className="flex flex-col justify-between rounded-lg border border-line p-4 sm:p-5">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-label font-medium uppercase tracking-wide text-ink-faint">
              {account.label || `${account.currency} wallet`}
            </p>
            <p className="mt-0.5 text-label uppercase tracking-wide text-ink-faint">
              Account {account.id}
            </p>
          </div>
          <VerifiedChip account={account} />
        </div>

        <div className="mt-5">
          <Amount value={account.balance} currency={account.currency} size="xl" />
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-label text-ink-faint">
            {reserved ? (
              <span>
                Available{" "}
                <AmountBare value={account.available} className="text-ink-muted" />
              </span>
            ) : (
              <span>Fully available</span>
            )}
            <span aria-hidden="true">·</span>
            <span>
              Daily remaining <AmountBare value={remainingToday} className="text-ink-muted" />
            </span>
          </p>
          <p className="mt-1 text-label text-ink-faint">
            {account.reconciled
              ? `Proved against the ledger ${account.verifiedAt ? formatDateTime(account.verifiedAt) : "recently"}`
              : "Awaiting the next ledger proof"}
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Link
          href={`/transfer?currency=${encodeURIComponent(account.currency)}`}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-ink bg-ink px-3 text-label font-medium uppercase tracking-wide text-white transition-colors hover:bg-white hover:text-ink"
        >
          <Icon name="send" className="h-3.5 w-3.5" />
          Send
        </Link>
        <Button size="sm" variant="secondary" onClick={onDeposit}>
          Add money
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={onWithdraw}
          disabled={!canWithdraw}
          title={
            !allowsWithdrawal
              ? "Your KYC tier does not allow withdrawals"
              : withdrawalsFrozen
                ? "Withdrawals are frozen on this profile"
                : undefined
          }
        >
          Withdraw
        </Button>
        <Link
          href={`/statement?accountId=${account.id}`}
          className="inline-flex h-9 shrink-0 items-center rounded-md border border-transparent px-2 text-label font-medium uppercase tracking-wide text-ink-muted hover:text-ink"
        >
          Statement
        </Link>
      </div>
    </article>
  );
}
