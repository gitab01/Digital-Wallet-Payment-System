"use client";

import { Wallet as WalletIcon, Star } from "lucide-react";
import { cn, formatCurrency, maskWalletNumber } from "@/lib/utils";
import type { Wallet } from "@/types";

interface WalletCardProps {
  wallet: Wallet;
  onClick?: () => void;
  selected?: boolean;
}

const CARD_GRADIENTS: Record<string, string> = {
  USD: "from-blue-600 to-indigo-700",
  EUR: "from-violet-600 to-purple-700",
  GBP: "from-emerald-600 to-teal-700",
  JPY: "from-rose-600 to-red-700",
  MYR: "from-amber-500 to-orange-600",
  SGD: "from-cyan-600 to-blue-700",
  DEFAULT: "from-slate-600 to-slate-800",
};

export function WalletCard({ wallet, onClick, selected }: WalletCardProps) {
  const gradient =
    CARD_GRADIENTS[wallet.currencyCode] ?? CARD_GRADIENTS.DEFAULT;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative w-full rounded-2xl bg-gradient-to-br p-6 text-left shadow-md transition-all",
        gradient,
        onClick && "cursor-pointer hover:-translate-y-1 hover:shadow-lg",
        selected && "ring-2 ring-white ring-offset-2",
        wallet.status !== "ACTIVE" && "opacity-60"
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <WalletIcon className="h-5 w-5 text-white/80" />
          <span className="text-sm font-medium text-white/80">
            {wallet.currencyCode} Wallet
          </span>
        </div>
        <div className="flex items-center gap-2">
          {wallet.isDefault && (
            <Star className="h-4 w-4 fill-yellow-300 text-yellow-300" />
          )}
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-medium",
              wallet.status === "ACTIVE"
                ? "bg-white/20 text-white"
                : "bg-red-200/30 text-red-100"
            )}
          >
            {wallet.status}
          </span>
        </div>
      </div>

      {/* Balance */}
      <div className="mt-6">
        <p className="text-xs text-white/60">Available balance</p>
        <p className="mt-1 text-2xl font-bold tracking-tight text-white">
          {formatCurrency(wallet.availableBalance, wallet.currencyCode)}
        </p>
      </div>

      {/* Wallet number */}
      <div className="mt-4">
        <p className="font-mono text-sm tracking-widest text-white/70">
          {maskWalletNumber(wallet.walletNumber)}
        </p>
      </div>
    </button>
  );
}
