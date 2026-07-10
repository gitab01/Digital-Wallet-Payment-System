"use client";

import { useState } from "react";
import {
  SlidersHorizontal, RotateCcw, ChevronLeft,
  ChevronRight, ListOrdered, Search,
} from "lucide-react";
import { useTransactions } from "@/hooks/useTransactions";
import { TransactionItem } from "@/components/transaction/TransactionItem";
import { cn } from "@/lib/utils";
import type { TransactionFilters, TransactionType, TransactionStatus } from "@/types";

const TYPES: TransactionType[]    = ["DEPOSIT","WITHDRAWAL","TRANSFER","PAYMENT","REFUND","FEE"];
const STATUSES: TransactionStatus[] = ["PENDING","PROCESSING","COMPLETED","FAILED","CANCELLED","REVERSED"];

export default function TransactionsPage() {
  const [filters, setFilters] = useState<TransactionFilters>({ page: 0, size: 20 });
  const [panel, setPanel]     = useState(false);

  const { data, isLoading, refetch } = useTransactions(filters);
  const txs       = data?.content ?? [];
  const total     = data?.totalElements ?? 0;
  const pages     = data?.totalPages ?? 0;
  const curPage   = data?.number ?? 0;

  const set = (key: keyof TransactionFilters, val: string) =>
    setFilters((f) => ({ ...f, [key]: val || undefined, page: 0 }));

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Transactions</h1>
          <p className="page-subtitle">{total.toLocaleString()} total records</p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setPanel(!panel)}
            className={cn("btn-secondary", panel && "border-brand-300 bg-brand-50 text-brand-700")}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filters
          </button>
          <button onClick={() => refetch()} className="btn-icon" aria-label="Refresh">
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Filter panel ── */}
      {panel && (
        <div className="card animate-slide-down grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="label">Type</label>
            <select className="input" onChange={(e) => set("type", e.target.value)}>
              <option value="">All types</option>
              {TYPES.map((t) => <option key={t} value={t}>{t.charAt(0)+t.slice(1).toLowerCase()}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" onChange={(e) => set("status", e.target.value)}>
              <option value="">All statuses</option>
              {STATUSES.map((s) => <option key={s} value={s}>{s.charAt(0)+s.slice(1).toLowerCase()}</option>)}
            </select>
          </div>
          <div>
            <label className="label">From date</label>
            <input
              type="date"
              className="input"
              onChange={(e) => set("startDate", e.target.value ? `${e.target.value}T00:00:00` : "")}
            />
          </div>
          <div>
            <label className="label">To date</label>
            <input
              type="date"
              className="input"
              onChange={(e) => set("endDate", e.target.value ? `${e.target.value}T23:59:59` : "")}
            />
          </div>
        </div>
      )}

      {/* ── List ── */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => <div key={i} className="skeleton h-[68px] rounded-2xl" />)}
        </div>
      ) : txs.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-50">
            <Search className="h-8 w-8 text-surface-300" />
          </div>
          <div>
            <p className="font-semibold text-surface-700">No transactions found</p>
            <p className="mt-1 text-sm text-surface-400">Try adjusting your filters.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {txs.map((tx) => <TransactionItem key={tx.id} transaction={tx} />)}
        </div>
      )}

      {/* ── Pagination ── */}
      {pages > 1 && (
        <div className="flex items-center justify-between rounded-2xl border border-surface-100 bg-white px-5 py-3 shadow-card">
          <p className="text-sm text-surface-400">
            Page <span className="font-semibold text-surface-700">{curPage + 1}</span> of{" "}
            <span className="font-semibold text-surface-700">{pages}</span>
          </p>
          <div className="flex gap-1.5">
            <button
              disabled={curPage === 0}
              onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 0) - 1 }))}
              className="btn-icon"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              disabled={curPage === pages - 1}
              onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 0) + 1 }))}
              className="btn-icon"
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
