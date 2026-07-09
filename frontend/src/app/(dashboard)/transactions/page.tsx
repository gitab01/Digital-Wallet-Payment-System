"use client";

import { useState } from "react";
import { Filter, RefreshCw } from "lucide-react";
import { useTransactions } from "@/hooks/useTransactions";
import { TransactionItem } from "@/components/transaction/TransactionItem";
import type { TransactionFilters, TransactionType, TransactionStatus } from "@/types";

const TRANSACTION_TYPES: TransactionType[] = [
  "DEPOSIT", "WITHDRAWAL", "TRANSFER", "PAYMENT", "REFUND", "FEE",
];
const TRANSACTION_STATUSES: TransactionStatus[] = [
  "PENDING", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED", "REVERSED",
];

export default function TransactionsPage() {
  const [filters, setFilters] = useState<TransactionFilters>({ page: 0, size: 20 });
  const [showFilters, setShowFilters] = useState(false);

  const { data, isLoading, refetch } = useTransactions(filters);

  const transactions = data?.content ?? [];
  const totalPages = data?.totalPages ?? 0;
  const currentPage = data?.number ?? 0;

  const updateFilter = (key: keyof TransactionFilters, value: string) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value || undefined,
      page: 0,
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Transactions</h1>
          <p className="mt-1 text-sm text-gray-500">
            {data?.totalElements ?? 0} total transactions
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="btn-secondary"
          >
            <Filter className="h-4 w-4" />
            Filters
          </button>
          <button onClick={() => refetch()} className="btn-secondary">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="card grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="label">Type</label>
            <select
              className="input-field mt-1"
              onChange={(e) => updateFilter("type", e.target.value)}
            >
              <option value="">All types</option>
              {TRANSACTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Status</label>
            <select
              className="input-field mt-1"
              onChange={(e) => updateFilter("status", e.target.value)}
            >
              <option value="">All statuses</option>
              {TRANSACTION_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="label">From date</label>
            <input
              type="date"
              className="input-field mt-1"
              onChange={(e) =>
                updateFilter("startDate", e.target.value ? `${e.target.value}T00:00:00` : "")
              }
            />
          </div>
          <div>
            <label className="label">To date</label>
            <input
              type="date"
              className="input-field mt-1"
              onChange={(e) =>
                updateFilter("endDate", e.target.value ? `${e.target.value}T23:59:59` : "")
              }
            />
          </div>
        </div>
      )}

      {/* Transaction list */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-200" />
          ))}
        </div>
      ) : transactions.length === 0 ? (
        <div className="card flex flex-col items-center py-12 text-center">
          <RefreshCw className="mb-3 h-10 w-10 text-gray-300" />
          <p className="text-gray-500">No transactions found.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {transactions.map((tx) => (
            <TransactionItem key={tx.id} transaction={tx} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            disabled={currentPage === 0}
            onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 0) - 1 }))}
            className="btn-secondary"
          >
            Previous
          </button>
          <span className="text-sm text-gray-500">
            Page {currentPage + 1} of {totalPages}
          </span>
          <button
            disabled={currentPage === totalPages - 1}
            onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 0) + 1 }))}
            className="btn-secondary"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
