"use client";

import {
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCw,
  PlusCircle,
  MinusCircle,
  Receipt,
} from "lucide-react";
import { cn, formatCurrency, formatDateTime, getStatusColor } from "@/lib/utils";
import type { Transaction } from "@/types";

interface TransactionItemProps {
  transaction: Transaction;
  currentUserId?: number;
}

const TYPE_CONFIG = {
  TRANSFER: { icon: ArrowUpRight, label: "Transfer", color: "text-blue-600" },
  DEPOSIT: { icon: PlusCircle, label: "Deposit", color: "text-green-600" },
  WITHDRAWAL: { icon: MinusCircle, label: "Withdrawal", color: "text-red-600" },
  PAYMENT: { icon: ArrowDownLeft, label: "Payment", color: "text-purple-600" },
  REFUND: { icon: RefreshCw, label: "Refund", color: "text-teal-600" },
  FEE: { icon: Receipt, label: "Fee", color: "text-orange-600" },
};

export function TransactionItem({ transaction }: TransactionItemProps) {
  const config = TYPE_CONFIG[transaction.type] ?? TYPE_CONFIG.TRANSFER;
  const Icon = config.icon;
  const statusColor = getStatusColor(transaction.status);
  const isCredit = !transaction.sourceWalletNumber;

  return (
    <div className="flex items-center gap-4 rounded-xl border border-gray-100 bg-white px-4 py-3.5 shadow-sm transition-shadow hover:shadow-md">
      {/* Icon */}
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
          isCredit ? "bg-green-50" : "bg-gray-50"
        )}
      >
        <Icon className={cn("h-5 w-5", isCredit ? "text-green-600" : config.color)} />
      </div>

      {/* Details */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <p className="truncate text-sm font-semibold text-gray-900">
            {transaction.description || config.label}
          </p>
          <span
            className={cn(
              "ml-2 rounded-full px-2 py-0.5 text-xs font-medium",
              statusColor.bg,
              statusColor.text
            )}
          >
            {transaction.status}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-400">
          <span className="font-mono">{transaction.referenceNumber}</span>
          <span>·</span>
          <span>{formatDateTime(transaction.createdAt)}</span>
        </div>
      </div>

      {/* Amount */}
      <div className="shrink-0 text-right">
        <p
          className={cn(
            "text-sm font-bold",
            isCredit ? "text-green-600" : "text-gray-900"
          )}
        >
          {isCredit ? "+" : "-"}
          {formatCurrency(transaction.amount, transaction.sourceCurrencyCode)}
        </p>
        {transaction.fee > 0 && (
          <p className="text-xs text-gray-400">
            Fee: {formatCurrency(transaction.fee, transaction.sourceCurrencyCode)}
          </p>
        )}
      </div>
    </div>
  );
}
