"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  SendHorizontal, Info, ChevronRight,
  CheckCircle2, Wallet as WalletIcon,
} from "lucide-react";
import { useWallets } from "@/hooks/useWallets";
import { useTransfer } from "@/hooks/useTransactions";
import { WalletCard } from "@/components/wallet/WalletCard";
import { cn, formatCurrency } from "@/lib/utils";
import type { Wallet } from "@/types";

const schema = z.object({
  sourceWalletNumber:      z.string().min(1, "Select a source wallet"),
  destinationWalletNumber: z.string().min(1, "Destination wallet number is required"),
  amount: z.coerce.number().positive("Must be greater than 0").max(1_000_000),
  description: z.string().max(500).optional(),
});
type Values = z.infer<typeof schema>;

export default function TransferPage() {
  const { data: wallets = [] } = useWallets();
  const transfer = useTransfer();
  const [source, setSource] = useState<Wallet | null>(null);

  const { register, handleSubmit, setValue, reset, watch, formState: { errors, isSubmitting } } =
    useForm<Values>({ resolver: zodResolver(schema) });

  const amount = watch("amount");
  const fee    = amount > 0 ? Number(amount) * 0.005 : 0;
  const total  = amount > 0 ? Number(amount) + fee : 0;

  const onSubmit = async (data: Values) => {
    await transfer.mutateAsync(data);
    reset();
    setSource(null);
  };

  const selectWallet = (w: Wallet) => {
    setSource(w);
    setValue("sourceWalletNumber", w.walletNumber);
  };

  const active = wallets.filter((w) => w.status === "ACTIVE");

  return (
    <div className="mx-auto max-w-2xl space-y-8 animate-fade-in">
      {/* ── Header ── */}
      <div>
        <h1 className="page-title">Send Money</h1>
        <p className="page-subtitle">Instant peer-to-peer wallet transfer</p>
      </div>

      {/* ── Step 1: Source wallet ── */}
      <div className="card space-y-4">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">1</span>
          <h2 className="font-semibold text-surface-800">Choose source wallet</h2>
        </div>

        {active.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl bg-surface-50 py-8 text-center">
            <WalletIcon className="h-8 w-8 text-surface-300" />
            <p className="text-sm text-surface-500">No active wallets. Create one first.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {active.map((w) => (
              <WalletCard
                key={w.id}
                wallet={w}
                onClick={() => selectWallet(w)}
                selected={source?.id === w.id}
              />
            ))}
          </div>
        )}

        {errors.sourceWalletNumber && (
          <p className="error-msg">{errors.sourceWalletNumber.message}</p>
        )}
      </div>

      {/* ── Step 2: Transfer details ── */}
      <form onSubmit={handleSubmit(onSubmit)} className="card space-y-5">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">2</span>
          <h2 className="font-semibold text-surface-800">Transfer details</h2>
        </div>

        <input type="hidden" {...register("sourceWalletNumber")} />

        {/* Destination */}
        <div>
          <label className="label">Destination wallet number</label>
          <input
            type="text"
            placeholder="WLT0000000000000"
            className={cn("input font-mono tracking-wider", errors.destinationWalletNumber && "input-error")}
            {...register("destinationWalletNumber")}
          />
          {errors.destinationWalletNumber && <p className="error-msg">{errors.destinationWalletNumber.message}</p>}
        </div>

        {/* Amount */}
        <div>
          <label className="label">
            Amount
            {source && (
              <span className="ml-2 normal-case font-normal text-surface-400">
                · Available: {formatCurrency(source.availableBalance, source.currencyCode)}
              </span>
            )}
          </label>
          <div className="relative">
            {source && (
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-surface-500">
                {source.currencyCode}
              </span>
            )}
            <input
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0.00"
              className={cn(
                "input text-right text-lg font-bold tabular-nums",
                source ? "pl-14" : "",
                errors.amount && "input-error"
              )}
              {...register("amount")}
            />
          </div>
          {errors.amount && <p className="error-msg">{errors.amount.message}</p>}
        </div>

        {/* Note */}
        <div>
          <label className="label">Note <span className="normal-case font-normal text-surface-400">(optional)</span></label>
          <input
            type="text"
            placeholder="What's this for?"
            className="input"
            {...register("description")}
          />
        </div>

        {/* Fee breakdown */}
        {amount > 0 && (
          <div className="rounded-2xl border border-brand-100 bg-brand-50 p-4 space-y-2 animate-fade-in">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-500">
              <Info className="h-3.5 w-3.5" /> Transfer breakdown
            </div>
            <div className="space-y-1.5 text-sm">
              <Row label="Amount" value={formatCurrency(Number(amount), source?.currencyCode ?? "USD")} />
              <Row label="Fee (0.5%)" value={formatCurrency(fee, source?.currencyCode ?? "USD")} />
              <div className="my-1 h-px bg-brand-200/50" />
              <Row label="Total" value={formatCurrency(total, source?.currencyCode ?? "USD")} bold />
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting || transfer.isPending || !source}
          className="btn-primary w-full py-3 text-[15px]"
        >
          {transfer.isPending ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Processing…
            </span>
          ) : (
            <>
              <SendHorizontal className="h-4 w-4" />
              Send {amount > 0 ? formatCurrency(Number(amount), source?.currencyCode ?? "USD") : ""}
              <ChevronRight className="h-4 w-4" />
            </>
          )}
        </button>
      </form>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={cn("text-surface-500", bold && "font-semibold text-surface-700")}>{label}</span>
      <span className={cn("text-surface-800 tabular-nums", bold && "font-bold text-brand-700")}>{value}</span>
    </div>
  );
}
