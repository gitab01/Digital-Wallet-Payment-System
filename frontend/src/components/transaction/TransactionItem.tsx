"use client";

import {
  ArrowUpRight,
  ArrowDownLeft,
  RotateCcw,
  CirclePlus,
  CircleMinus,
  CreditCard,
  Banknote,
} from "lucide-react";
import { cn, formatCurrency, formatDateTime, getStatusColor } from "@/lib/utils";
import type { Transaction } from "@/types";

interface Props {
  transaction: Transaction;
}

const TYPE_CFG = {
  TRANSFER:   { icon: ArrowUpRight,  label: "Transfer",   iconBg: "bg-violet-50",   iconColor: "text-violet-600" },
  DEPOSIT:    { icon: CirclePlus,    label: "Deposit",    iconBg: "bg-emerald-50",  iconColor: "text-emerald-600" },
  WITHDRAWAL: { icon: CircleMinus,   label: "Withdrawal", iconBg: "bg-rose-50",     iconColor: "text-rose-600" },
  PAYMENT:    { icon: CreditCard,    label: "Payment",    iconBg: "bg-sky-50",      iconColor: "text-sky-600" },
  REFUND:     { icon: RotateCcw,     label: "Refund",     iconBg: "bg-teal-50",     iconColor: "text-teal-600" },
  FEE:        { icon: Banknote,      label: "Fee",        iconBg: "bg-amber-50",    iconColor: "text-amber-600" },
} as const;

const STATUS_STYLES: Record<string, string> = {
  COMPLETED:  "badge-success",
  PENDING:    "badge-warning",
  PROCESSING: "badge-info",
  FAILED:     "badge-error",
  CANCELLED:  "badge-neutral",
  REVERSED:   "badge-purple",
};

export function TransactionItem({ transaction }: Props) {
  const cfg   = TYPE_CFG[transaction.type] ?? TYPE_CFG.TRANSFER;
  const Icon  = cfg.icon;
  const isCredit   = transaction.type === "DEPOSIT" || transaction.type === "REFUND";
  const badgeClass = STATUS_STYLES[transaction.status] ?? "badge-neutral";

  return (
    <div className="group flex items-center gap-4 rounded-2xl border border-surface-100 bg-white px-4 py-3.5 shadow-card transition-all duration-150 hover:border-surface-200 hover:shadow-card-md">

      {/* ── Icon ── */}
      <div
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition-transform duration-150 group-hover:scale-105",
          cfg.iconBg
        )}
      >
        <Icon className={cn("h-5 w-5", cfg.iconColor)} strokeWidth={2} />
      </div>

      {/* ── Details ── */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-[13.5px] font-semibold text-surface-800">
            {transaction.description || cfg.label}
          </p>
          <span className={badgeClass}>{transaction.status}</span>
        </div>

        <div className="mt-0.5 flex items-center gap-2 text-xs text-surface-400">
          <span className="font-mono text-[11px]">{transaction.referenceNumber}</span>
          <span className="text-surface-300">·</span>
          <span>{formatDateTime(transaction.createdAt)}</span>

          {/* Wallets */}
          {transaction.sourceWalletNumber && (
            <>
              <span className="text-surface-300">·</span>
              <span className="hidden sm:inline font-mono text-[11px]">
                {transaction.sourceWalletNumber.slice(-6)}
                {transaction.destinationWalletNumber && (
                  <> → {transaction.destinationWalletNumber.slice(-6)}</>
                )}
              </span>
            </>
          )}
        </div>
      </div>

      {/* ── Amount ── */}
      <div className="shrink-0 text-right">
        <p
          className={cn(
            "text-[14px] font-bold tabular-nums",
            isCredit ? "text-emerald-600" : "text-surface-800"
          )}
        >
          {isCredit ? "+" : "−"}
          {formatCurrency(transaction.amount, transaction.sourceCurrencyCode)}
        </p>
        {transaction.fee > 0 && (
          <p className="mt-0.5 text-[11px] text-surface-400">
            fee {formatCurrency(transaction.fee, transaction.sourceCurrencyCode)}
          </p>
        )}
      </div>
    </div>
  );
}
