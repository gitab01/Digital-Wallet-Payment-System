"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  TrendingUp,
  TrendingDown,
  ArrowLeftRight,
  Plus,
  RefreshCw,
} from "lucide-react";
import { useWallets } from "@/hooks/useWallets";
import { useTransactions } from "@/hooks/useTransactions";
import { useAuthStore } from "@/store/authStore";
import { WalletCard } from "@/components/wallet/WalletCard";
import { TransactionItem } from "@/components/transaction/TransactionItem";
import { formatCurrency } from "@/lib/utils";

export default function DashboardPage() {
  const { user } = useAuthStore();
  const { data: wallets = [], isLoading: walletsLoading } = useWallets();
  const { data: txPage, isLoading: txLoading } = useTransactions({ size: 5 });

  const recentTransactions = txPage?.content ?? [];

  const totalUSD = useMemo(() => {
    const usd = wallets.find((w) => w.currencyCode === "USD");
    return usd?.availableBalance ?? 0;
  }, [wallets]);

  const stats = useMemo(() => {
    const deposits = recentTransactions.filter((t) => t.type === "DEPOSIT");
    const transfers = recentTransactions.filter((t) => t.type === "TRANSFER");
    return {
      deposits: deposits.reduce((s, t) => s + t.amount, 0),
      transfers: transfers.length,
    };
  }, [recentTransactions]);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {user?.firstName}!
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Here&apos;s an overview of your wallets and recent activity.
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="card">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Total wallets</p>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
              <ArrowLeftRight className="h-4 w-4 text-blue-600" />
            </div>
          </div>
          <p className="mt-2 text-3xl font-bold text-gray-900">{wallets.length}</p>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Recent deposits</p>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-50">
              <TrendingUp className="h-4 w-4 text-green-600" />
            </div>
          </div>
          <p className="mt-2 text-3xl font-bold text-gray-900">
            {formatCurrency(stats.deposits, "USD")}
          </p>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Transfers made</p>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-50">
              <TrendingDown className="h-4 w-4 text-purple-600" />
            </div>
          </div>
          <p className="mt-2 text-3xl font-bold text-gray-900">{stats.transfers}</p>
        </div>
      </div>

      {/* Wallets */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">My Wallets</h2>
          <Link href="/wallet" className="btn-secondary text-xs">
            <Plus className="h-3.5 w-3.5" /> New wallet
          </Link>
        </div>

        {walletsLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="h-40 animate-pulse rounded-2xl bg-gray-200" />
            ))}
          </div>
        ) : wallets.length === 0 ? (
          <div className="card flex flex-col items-center py-10 text-center">
            <p className="text-gray-500">No wallets yet.</p>
            <Link href="/wallet" className="btn-primary mt-4">
              Create your first wallet
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {wallets.map((wallet) => (
              <WalletCard key={wallet.id} wallet={wallet} />
            ))}
          </div>
        )}
      </div>

      {/* Recent Transactions */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Recent Transactions</h2>
          <Link href="/transactions" className="text-sm text-primary-600 hover:underline">
            View all
          </Link>
        </div>

        {txLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-200" />
            ))}
          </div>
        ) : recentTransactions.length === 0 ? (
          <div className="card flex flex-col items-center py-8 text-center">
            <RefreshCw className="mb-2 h-8 w-8 text-gray-300" />
            <p className="text-gray-500">No transactions yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentTransactions.map((tx) => (
              <TransactionItem key={tx.id} transaction={tx} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
