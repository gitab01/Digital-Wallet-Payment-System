"use client";

import Link from "next/link";

import type { WalletAccount } from "@/lib/types";
import { formatDateTime } from "@/lib/money";
import { Amount, AmountBare } from "@/components/ui/Amount";
import { Button } from "@/components/ui/Button";
import { VerifiedChip } from "@/components/ui/Chip";
import { Icon } from "@/components/ui/Icon";

/**
 * One currency wallet. The daily limit is deliberately absent: it belongs to the
 * customer and is identical on every card, so repeating it three times only says the
 * same thing in three places.
 */
export function AccountCard({
  account,
  allowsWithdrawal,
  withdrawalsFrozen,
  onDeposit,
  onWithdraw,
}: {
  account: WalletAccount;
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
          {reserved ? (
            <p className="mt-2 text-label text-ink-faint">
              Available{" "}
              <AmountBare value={account.available} className="text-ink-muted" /> · the rest is
              held by an in-flight movement
            </p>
          ) : null}
          {account.reconciled ? (
            <p className="mt-1 text-label text-ink-faint">
              Proved against the ledger {account.verifiedAt ? formatDateTime(account.verifiedAt) : "recently"}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
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
        <button
          type="button"
          onClick={onWithdraw}
          disabled={!canWithdraw}
          title={
            !allowsWithdrawal
              ? "Your KYC tier does not allow withdrawals"
              : withdrawalsFrozen
                ? "Withdrawals are frozen on this profile"
                : undefined
          }
          className="inline-flex h-9 shrink-0 items-center rounded-md px-2 text-label font-medium uppercase tracking-wide text-ink-muted underline-offset-4 hover:text-ink hover:underline disabled:text-ink-faint/60 disabled:no-underline"
        >
          Withdraw
        </button>
        <Link
          href={`/statement?accountId=${account.id}`}
          className="inline-flex h-9 shrink-0 items-center rounded-md px-2 text-label font-medium uppercase tracking-wide text-ink-muted underline-offset-4 hover:text-ink hover:underline"
        >
          Statement
        </Link>
      </div>
    </article>
  );
}
