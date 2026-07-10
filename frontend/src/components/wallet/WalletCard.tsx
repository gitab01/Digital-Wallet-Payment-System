"use client";

import {
  Wallet as WalletIcon,
  Star,
  Snowflake,
  CircleOff,
  Wifi,
} from "lucide-react";
import { cn, formatCurrency, maskWalletNumber } from "@/lib/utils";
import type { Wallet } from "@/types";

interface WalletCardProps {
  wallet: Wallet;
  onClick?: () => void;
  selected?: boolean;
}

const THEMES: Record<string, { bg: string; chip: string; glow: string }> = {
  USD: {
    bg:   "from-indigo-600 via-violet-600 to-purple-700",
    chip: "bg-yellow-400",
    glow: "shadow-[0_8px_32px_rgba(99,102,241,.45)]",
  },
  EUR: {
    bg:   "from-sky-600 via-blue-600 to-indigo-700",
    chip: "bg-yellow-400",
    glow: "shadow-[0_8px_32px_rgba(56,189,248,.40)]",
  },
  GBP: {
    bg:   "from-emerald-600 via-teal-600 to-cyan-700",
    chip: "bg-yellow-300",
    glow: "shadow-[0_8px_32px_rgba(16,185,129,.40)]",
  },
  JPY: {
    bg:   "from-rose-600 via-red-600 to-pink-700",
    chip: "bg-yellow-400",
    glow: "shadow-[0_8px_32px_rgba(244,63,94,.40)]",
  },
  MYR: {
    bg:   "from-amber-500 via-orange-500 to-red-600",
    chip: "bg-yellow-300",
    glow: "shadow-[0_8px_32px_rgba(245,158,11,.40)]",
  },
  SGD: {
    bg:   "from-cyan-600 via-sky-600 to-blue-700",
    chip: "bg-yellow-400",
    glow: "shadow-[0_8px_32px_rgba(6,182,212,.40)]",
  },
  AUD: {
    bg:   "from-lime-600 via-green-600 to-teal-700",
    chip: "bg-yellow-300",
    glow: "shadow-[0_8px_32px_rgba(101,163,13,.40)]",
  },
  CAD: {
    bg:   "from-orange-600 via-amber-600 to-yellow-600",
    chip: "bg-yellow-200",
    glow: "shadow-[0_8px_32px_rgba(234,88,12,.40)]",
  },
  DEFAULT: {
    bg:   "from-slate-600 via-slate-700 to-slate-800",
    chip: "bg-yellow-400",
    glow: "shadow-[0_8px_32px_rgba(71,85,105,.40)]",
  },
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$", EUR: "€", GBP: "£", JPY: "¥",
  MYR: "RM", SGD: "S$", AUD: "A$", CAD: "C$",
};

export function WalletCard({ wallet, onClick, selected }: WalletCardProps) {
  const theme = THEMES[wallet.currencyCode] ?? THEMES.DEFAULT;
  const symbol = CURRENCY_SYMBOLS[wallet.currencyCode] ?? wallet.currencyCode;
  const isActive = wallet.status === "ACTIVE";
  const isFrozen = wallet.status === "FROZEN";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-pressed={selected}
      className={cn(
        "relative w-full rounded-3xl bg-gradient-to-br p-6 text-left",
        "transition-all duration-200 select-none",
        theme.bg,
        isActive && onClick && "cursor-pointer hover:-translate-y-1 hover:scale-[1.01]",
        isActive ? theme.glow : "opacity-70 shadow-card",
        selected && "ring-2 ring-white ring-offset-2 ring-offset-surface-50 scale-[1.01]",
        !isActive && "cursor-default"
      )}
    >
      {/* ── Decorative circles ── */}
      <span className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/[.07]" />
      <span className="pointer-events-none absolute -right-2 top-8 h-20 w-20 rounded-full bg-white/[.05]" />

      {/* ── Top row ── */}
      <div className="relative flex items-start justify-between">
        <div className="flex items-center gap-2">
          <WalletIcon className="h-5 w-5 text-white/70" />
          <span className="text-xs font-semibold uppercase tracking-widest text-white/70">
            {wallet.currencyCode} Wallet
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {wallet.isDefault && (
            <Star className="h-4 w-4 fill-yellow-300 text-yellow-300" />
          )}
          {isFrozen && (
            <Snowflake className="h-4 w-4 text-sky-300" />
          )}
          {wallet.status === "CLOSED" && (
            <CircleOff className="h-4 w-4 text-red-300" />
          )}
          {/* Contactless icon */}
          <Wifi
            className="h-4 w-4 rotate-90 text-white/30"
            strokeWidth={1.5}
          />
        </div>
      </div>

      {/* ── Balance ── */}
      <div className="relative mt-7">
        <p className="text-[11px] font-medium uppercase tracking-widest text-white/50">
          Available Balance
        </p>
        <p className="mt-1 text-[28px] font-bold leading-none tracking-tight text-white">
          {formatCurrency(wallet.availableBalance, wallet.currencyCode)}
        </p>
        {wallet.balance !== wallet.availableBalance && (
          <p className="mt-1 text-xs text-white/40">
            Total: {formatCurrency(wallet.balance, wallet.currencyCode)}
          </p>
        )}
      </div>

      {/* ── Bottom row ── */}
      <div className="relative mt-6 flex items-end justify-between">
        <p className="font-mono text-sm tracking-[.18em] text-white/60">
          {maskWalletNumber(wallet.walletNumber)}
        </p>

        {/* EMV chip */}
        <div className={cn("h-7 w-9 rounded-md", theme.chip, "opacity-80")} />
      </div>
    </button>
  );
}
