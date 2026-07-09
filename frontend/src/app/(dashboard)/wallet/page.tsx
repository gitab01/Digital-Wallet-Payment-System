"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Download } from "lucide-react";
import { useWallets, useCreateWallet, useDeposit } from "@/hooks/useWallets";
import { WalletCard } from "@/components/wallet/WalletCard";
import type { Wallet } from "@/types";

const CURRENCIES = ["USD", "EUR", "GBP", "JPY", "MYR", "SGD", "AUD", "CAD"];

const createWalletSchema = z.object({
  currencyCode: z.string().length(3),
  setAsDefault: z.boolean().optional(),
});

const depositSchema = z.object({
  amount: z.coerce.number().positive("Amount must be positive"),
  description: z.string().optional(),
});

export default function WalletPage() {
  const { data: wallets = [], isLoading } = useWallets();
  const createWallet = useCreateWallet();
  const deposit = useDeposit();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [depositWallet, setDepositWallet] = useState<Wallet | null>(null);

  const createForm = useForm({ resolver: zodResolver(createWalletSchema), defaultValues: { currencyCode: "USD" } });
  const depositForm = useForm({ resolver: zodResolver(depositSchema) });

  const onCreateWallet = async (data: z.infer<typeof createWalletSchema>) => {
    await createWallet.mutateAsync(data);
    setShowCreateModal(false);
    createForm.reset();
  };

  const onDeposit = async (data: z.infer<typeof depositSchema>) => {
    if (!depositWallet) return;
    await deposit.mutateAsync({ walletNumber: depositWallet.walletNumber, ...data });
    setDepositWallet(null);
    depositForm.reset();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Wallets</h1>
          <p className="mt-1 text-sm text-gray-500">Manage your multi-currency wallets</p>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> New Wallet
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-44 animate-pulse rounded-2xl bg-gray-200" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {wallets.map((wallet) => (
            <div key={wallet.id} className="space-y-3">
              <WalletCard wallet={wallet} />
              <button
                onClick={() => setDepositWallet(wallet)}
                className="btn-secondary w-full text-xs"
              >
                <Download className="h-3.5 w-3.5" /> Deposit
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Create Wallet Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900">Create New Wallet</h2>
            <form onSubmit={createForm.handleSubmit(onCreateWallet)} className="mt-4 space-y-4">
              <div>
                <label className="label">Currency</label>
                <select className="input-field mt-1" {...createForm.register("currencyCode")}>
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" {...createForm.register("setAsDefault")} />
                Set as default wallet
              </label>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowCreateModal(false)} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={createWallet.isPending} className="btn-primary flex-1">
                  {createWallet.isPending ? "Creating…" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Deposit Modal */}
      {depositWallet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900">
              Deposit to {depositWallet.currencyCode} Wallet
            </h2>
            <form onSubmit={depositForm.handleSubmit(onDeposit)} className="mt-4 space-y-4">
              <div>
                <label className="label">Amount ({depositWallet.currencyCode})</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  className="input-field mt-1"
                  {...depositForm.register("amount")}
                />
                {depositForm.formState.errors.amount && (
                  <p className="error-message">{depositForm.formState.errors.amount.message}</p>
                )}
              </div>
              <div>
                <label className="label">Description (optional)</label>
                <input type="text" placeholder="e.g. Bank transfer" className="input-field mt-1" {...depositForm.register("description")} />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setDepositWallet(null)} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={deposit.isPending} className="btn-primary flex-1">
                  {deposit.isPending ? "Processing…" : "Deposit"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
