"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Plus, ArrowDownToLine, X, Coins,
  Wallet as WalletIcon, CheckCircle2,
} from "lucide-react";
import { useWallets, useCreateWallet, useDeposit } from "@/hooks/useWallets";
import { WalletCard } from "@/components/wallet/WalletCard";
import { cn } from "@/lib/utils";
import type { Wallet } from "@/types";

const CURRENCIES = [
  { code: "USD", label: "🇺🇸 US Dollar" },
  { code: "EUR", label: "🇪🇺 Euro" },
  { code: "GBP", label: "🇬🇧 British Pound" },
  { code: "JPY", label: "🇯🇵 Japanese Yen" },
  { code: "MYR", label: "🇲🇾 Malaysian Ringgit" },
  { code: "SGD", label: "🇸🇬 Singapore Dollar" },
  { code: "AUD", label: "🇦🇺 Australian Dollar" },
  { code: "CAD", label: "🇨🇦 Canadian Dollar" },
];

const createSchema  = z.object({ currencyCode: z.string().length(3), setAsDefault: z.boolean().optional() });
const depositSchema = z.object({
  amount:      z.coerce.number().positive("Amount must be positive"),
  description: z.string().optional(),
});

export default function WalletPage() {
  const { data: wallets = [], isLoading } = useWallets();
  const create  = useCreateWallet();
  const deposit = useDeposit();

  const [showCreate,  setShowCreate]  = useState(false);
  const [depositWallet, setDeposit]   = useState<Wallet | null>(null);

  const cForm = useForm({ resolver: zodResolver(createSchema),  defaultValues: { currencyCode: "USD" } });
  const dForm = useForm({ resolver: zodResolver(depositSchema) });

  const onCreate = async (d: z.infer<typeof createSchema>) => {
    await create.mutateAsync(d);
    setShowCreate(false);
    cForm.reset();
  };

  const onDeposit = async (d: z.infer<typeof depositSchema>) => {
    if (!depositWallet) return;
    await deposit.mutateAsync({ walletNumber: depositWallet.walletNumber, ...d });
    setDeposit(null);
    dForm.reset();
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">My Wallets</h1>
          <p className="page-subtitle">Manage your multi-currency accounts</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> New Wallet
        </button>
      </div>

      {/* ── Grid ── */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-48 rounded-3xl" />)}
        </div>
      ) : wallets.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50">
            <WalletIcon className="h-8 w-8 text-brand-500" />
          </div>
          <div>
            <p className="font-semibold text-surface-800">No wallets yet</p>
            <p className="mt-1 text-sm text-surface-400">Create your first wallet to start transacting.</p>
          </div>
          <button onClick={() => setShowCreate(true)} className="btn-primary mt-2">
            <Plus className="h-4 w-4" /> Create wallet
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {wallets.map((wallet) => (
            <div key={wallet.id} className="flex flex-col gap-3">
              <WalletCard wallet={wallet} />
              <button
                onClick={() => setDeposit(wallet)}
                disabled={wallet.status !== "ACTIVE"}
                className="btn-secondary w-full py-2.5 text-[13px]"
              >
                <ArrowDownToLine className="h-3.5 w-3.5" />
                Add Funds
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Create Wallet Modal ── */}
      {showCreate && (
        <div className="modal-overlay">
          <div className="modal-panel">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-surface-900">New Wallet</h2>
              <button onClick={() => setShowCreate(false)} className="btn-icon">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={cForm.handleSubmit(onCreate)} className="mt-6 space-y-5">
              <div>
                <label className="label">Currency</label>
                <div className="relative">
                  <Coins className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400 pointer-events-none" />
                  <select className="input pl-10 appearance-none" {...cForm.register("currencyCode")}>
                    {CURRENCIES.map(({ code, label }) => (
                      <option key={code} value={code}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-surface-100 p-3.5 hover:bg-surface-50 transition-colors">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-surface-300 text-brand-600 focus:ring-brand-400"
                  {...cForm.register("setAsDefault")}
                />
                <div>
                  <p className="text-sm font-medium text-surface-800">Set as default wallet</p>
                  <p className="text-xs text-surface-400">Used for payments and quick transfers</p>
                </div>
              </label>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary flex-1">
                  Cancel
                </button>
                <button type="submit" disabled={create.isPending} className="btn-primary flex-1">
                  {create.isPending ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  ) : (
                    <><CheckCircle2 className="h-4 w-4" /> Create</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Deposit Modal ── */}
      {depositWallet && (
        <div className="modal-overlay">
          <div className="modal-panel">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-surface-900">
                Add Funds
              </h2>
              <button onClick={() => setDeposit(null)} className="btn-icon">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1 text-sm text-surface-400">
              Deposit to your {depositWallet.currencyCode} wallet
            </p>

            <form onSubmit={dForm.handleSubmit(onDeposit)} className="mt-6 space-y-4">
              <div>
                <label className="label">Amount ({depositWallet.currencyCode})</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-surface-500">
                    {depositWallet.currencyCode}
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0.00"
                    className={cn("input pl-14 text-right text-lg font-bold tabular-nums", dForm.formState.errors.amount && "input-error")}
                    {...dForm.register("amount")}
                  />
                </div>
                {dForm.formState.errors.amount && (
                  <p className="error-msg">{dForm.formState.errors.amount.message}</p>
                )}
              </div>

              <div>
                <label className="label">Note <span className="normal-case font-normal text-surface-400">(optional)</span></label>
                <input
                  type="text"
                  placeholder="e.g. Bank transfer"
                  className="input"
                  {...dForm.register("description")}
                />
              </div>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setDeposit(null)} className="btn-secondary flex-1">
                  Cancel
                </button>
                <button type="submit" disabled={deposit.isPending} className="btn-primary flex-1">
                  {deposit.isPending ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  ) : (
                    <><ArrowDownToLine className="h-4 w-4" /> Deposit</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
