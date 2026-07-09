"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeftRight, Info } from "lucide-react";
import { useWallets } from "@/hooks/useWallets";
import { useTransfer } from "@/hooks/useTransactions";
import { WalletCard } from "@/components/wallet/WalletCard";
import { formatCurrency } from "@/lib/utils";
import type { Wallet } from "@/types";
import { useState } from "react";

const transferSchema = z.object({
  sourceWalletNumber: z.string().min(1, "Select a source wallet"),
  destinationWalletNumber: z
    .string()
    .min(1, "Destination wallet number is required"),
  amount: z.coerce
    .number()
    .positive("Amount must be greater than 0")
    .max(1_000_000, "Maximum transfer is 1,000,000"),
  description: z.string().max(500).optional(),
});

type TransferFormValues = z.infer<typeof transferSchema>;

export default function TransferPage() {
  const { data: wallets = [] } = useWallets();
  const transfer = useTransfer();
  const [selectedSource, setSelectedSource] = useState<Wallet | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<TransferFormValues>({
    resolver: zodResolver(transferSchema),
  });

  const amount = watch("amount");
  const estimatedFee = amount ? Number(amount) * 0.005 : 0;

  const onSubmit = async (data: TransferFormValues) => {
    await transfer.mutateAsync(data);
    reset();
    setSelectedSource(null);
  };

  const handleSelectSource = (wallet: Wallet) => {
    setSelectedSource(wallet);
    setValue("sourceWalletNumber", wallet.walletNumber);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Send Money</h1>
        <p className="mt-1 text-sm text-gray-500">
          Transfer funds to any wallet instantly
        </p>
      </div>

      {/* Source wallet selection */}
      <div className="card space-y-4">
        <h2 className="font-semibold text-gray-800">Select Source Wallet</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {wallets
            .filter((w) => w.status === "ACTIVE")
            .map((wallet) => (
              <WalletCard
                key={wallet.id}
                wallet={wallet}
                onClick={() => handleSelectSource(wallet)}
                selected={selectedSource?.id === wallet.id}
              />
            ))}
        </div>
        {errors.sourceWalletNumber && (
          <p className="error-message">{errors.sourceWalletNumber.message}</p>
        )}
      </div>

      {/* Transfer form */}
      <form onSubmit={handleSubmit(onSubmit)} className="card space-y-5">
        <h2 className="font-semibold text-gray-800">Transfer Details</h2>

        <input type="hidden" {...register("sourceWalletNumber")} />

        {/* Destination */}
        <div>
          <label className="label">Destination wallet number</label>
          <input
            type="text"
            placeholder="WLT0000000000000"
            className="input-field mt-1 font-mono"
            {...register("destinationWalletNumber")}
          />
          {errors.destinationWalletNumber && (
            <p className="error-message">
              {errors.destinationWalletNumber.message}
            </p>
          )}
        </div>

        {/* Amount */}
        <div>
          <label className="label">
            Amount
            {selectedSource && (
              <span className="ml-2 text-gray-400">
                (Available:{" "}
                {formatCurrency(
                  selectedSource.availableBalance,
                  selectedSource.currencyCode
                )}
                )
              </span>
            )}
          </label>
          <div className="relative mt-1">
            <input
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0.00"
              className="input-field pr-16"
              {...register("amount")}
            />
            {selectedSource && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-gray-500">
                {selectedSource.currencyCode}
              </span>
            )}
          </div>
          {errors.amount && (
            <p className="error-message">{errors.amount.message}</p>
          )}
        </div>

        {/* Description */}
        <div>
          <label className="label">
            Note{" "}
            <span className="text-gray-400">(optional)</span>
          </label>
          <input
            type="text"
            placeholder="What is this transfer for?"
            className="input-field mt-1"
            {...register("description")}
          />
        </div>

        {/* Fee summary */}
        {amount > 0 && (
          <div className="flex items-start gap-2 rounded-lg bg-blue-50 p-3 text-sm text-blue-700">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Cross-currency fee (0.5%):{" "}
              <strong>
                {formatCurrency(estimatedFee, selectedSource?.currencyCode ?? "USD")}
              </strong>
            </span>
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting || transfer.isPending || !selectedSource}
          className="btn-primary w-full"
        >
          <ArrowLeftRight className="h-4 w-4" />
          {transfer.isPending ? "Processing…" : "Send Money"}
        </button>
      </form>
    </div>
  );
}
