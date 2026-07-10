"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  Wallet, SendHorizontal, ArrowDownToLine,
  TrendingUp, ArrowUpRight, Sparkles,
  LayoutGrid, ListOrdered,
} from "lucide-react";
import { useWallets } from "@/hooks/useWallets";
import { useTransactions } from "@/hooks/useTransactions";
import { useAuthStore } from "@/store/authStore";
import { WalletCard } from "@/components/wallet/WalletCard";
import { TransactionItem } from "@/components/transaction/TransactionItem";
import { formatCurrency } from "@/lib/utils";
import type { Metadata } from "next";

export default function DashboardPage() {
  const { user }   = useAuthStore();
  const { data: wallets = [], isLoading: wLoad }   = useWallets();
  const { data: txPage,        isLoading: txLoad }  = useTransactions({ size: 5 });

  const recent = txPage?.content ?? [];

  const stats = useMemo(() => {
    const totalBalance  = wallets.reduce((s, w) => s + w.availableBalance, 0);
    const totalDeposits = recent.filter((t) => t.type === "DEPOSIT")
                                .reduce((s, t) => s + t.amount, 0);
    const totalOut      = recent.filter((t) => t.type === "TRANSFER" || t.type === "PAYMENT")
                                .reduce((s, t) => s + t.amount, 0);
    return { totalBalance, totalDeposits, totalOut, walletCount: wallets.length };
  }, [wallets, recent]);

  const defaultWallet = wallets.find((w) => w.isDefault) ?? wallets[0];

  return (
    <div className="space-y-8 animate-fade-in">
      {/* ── Hero greeting ── */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-surface-400">
            {greeting()}, {user?.firstName} 👋
          </p>
          <h1 className="mt-0.5 text-3xl font-extrabold tracking-tight text-surface-900">
            Overview
          </h1>
        </div>

        <div className="flex gap-2">
          <Link href="/transfer" className="btn-primary">
            <SendHorizontal className="h-4 w-4" /> Send
          </Link>
          <Link href="/wallet" className="btn-secondary">
            <ArrowDownToLine className="h-4 w-4" /> Deposit
          </Link>
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          variant="blue"
          icon={<Wallet className="h-5 w-5 text-blue-600" />}
          label="Total Balance"
          value={formatCurrency(stats.totalBalance, defaultWallet?.currencyCode ?? "USD")}
          sub={`${stats.walletCount} wallet${stats.walletCount !== 1 ? "s" : ""}`}
          loading={wLoad}
        />
        <StatCard
          variant="green"
          icon={<TrendingUp className="h-5 w-5 text-emerald-600" />}
          label="Deposits"
          value={formatCurrency(stats.totalDeposits, "USD")}
          sub="Recent activity"
          loading={txLoad}
        />
        <StatCard
          variant="purple"
          icon={<ArrowUpRight className="h-5 w-5 text-violet-600" />}
          label="Sent"
          value={formatCurrency(stats.totalOut, "USD")}
          sub="Recent activity"
          loading={txLoad}
        />
        <StatCard
          variant="amber"
          icon={<Sparkles className="h-5 w-5 text-amber-600" />}
          label="Transactions"
          value={String(txPage?.totalElements ?? 0)}
          sub="All time"
          loading={txLoad}
        />
      </div>

      {/* ── Wallets ── */}
      <section>
        <div className="page-header">
          <div className="flex items-center gap-2">
            <LayoutGrid className="h-5 w-5 text-surface-400" />
            <h2 className="text-lg font-bold text-surface-900">My Wallets</h2>
          </div>
          <Link href="/wallet" className="btn-secondary text-xs py-2 px-3">
            Manage wallets
          </Link>
        </div>

        {wLoad ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="skeleton h-44 rounded-3xl" />
            ))}
          </div>
        ) : wallets.length === 0 ? (
          <EmptyState
            icon={<Wallet className="h-10 w-10 text-surface-300" />}
            title="No wallets yet"
            desc="Create your first wallet to get started."
            action={<Link href="/wallet" className="btn-primary">Create wallet</Link>}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {wallets.map((w) => <WalletCard key={w.id} wallet={w} />)}
          </div>
        )}
      </section>

      {/* ── Recent transactions ── */}
      <section>
        <div className="page-header">
          <div className="flex items-center gap-2">
            <ListOrdered className="h-5 w-5 text-surface-400" />
            <h2 className="text-lg font-bold text-surface-900">Recent Transactions</h2>
          </div>
          <Link href="/transactions" className="text-sm font-semibold text-brand-600 hover:text-brand-500">
            View all →
          </Link>
        </div>

        {txLoad ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-[68px] rounded-2xl" />)}
          </div>
        ) : recent.length === 0 ? (
          <EmptyState
            icon={<ListOrdered className="h-10 w-10 text-surface-300" />}
            title="No transactions yet"
            desc="Transactions will appear here after your first transfer."
          />
        ) : (
          <div className="space-y-2">
            {recent.map((tx) => <TransactionItem key={tx.id} transaction={tx} />)}
          </div>
        )}
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

type StatVariant = "blue" | "green" | "purple" | "amber";

const VARIANT_CLASSES: Record<StatVariant, { bar: string; icon: string }> = {
  blue:   { bar: "stat-card-blue",   icon: "bg-blue-50" },
  green:  { bar: "stat-card-green",  icon: "bg-emerald-50" },
  purple: { bar: "stat-card-purple", icon: "bg-violet-50" },
  amber:  { bar: "stat-card-amber",  icon: "bg-amber-50" },
};

function StatCard({
  variant, icon, label, value, sub, loading,
}: {
  variant: StatVariant;
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  loading?: boolean;
}) {
  const v = VARIANT_CLASSES[variant];
  return (
    <div className={`stat-card ${v.bar}`}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-surface-400">{label}</p>
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${v.icon}`}>
          {icon}
        </div>
      </div>
      {loading ? (
        <div className="space-y-1.5">
          <div className="skeleton h-7 w-28 rounded-lg" />
          <div className="skeleton h-4 w-16 rounded" />
        </div>
      ) : (
        <>
          <p className="text-2xl font-extrabold tabular-nums text-surface-900">{value}</p>
          <p className="text-xs text-surface-400">{sub}</p>
        </>
      )}
    </div>
  );
}

function EmptyState({
  icon, title, desc, action,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center gap-3 py-14 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-50">
        {icon}
      </div>
      <div>
        <p className="font-semibold text-surface-700">{title}</p>
        <p className="mt-1 text-sm text-surface-400">{desc}</p>
      </div>
      {action}
    </div>
  );
}
