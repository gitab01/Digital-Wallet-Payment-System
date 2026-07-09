"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { transactionApi } from "@/lib/api";
import { getErrorMessage } from "@/lib/utils";
import type { TransactionFilters, TransferRequest } from "@/types";
import toast from "react-hot-toast";

export const TRANSACTIONS_QUERY_KEY = ["transactions"] as const;

/**
 * Fetches paginated transaction history with optional filters.
 */
export function useTransactions(filters: TransactionFilters = {}) {
  return useQuery({
    queryKey: [...TRANSACTIONS_QUERY_KEY, filters],
    queryFn: async () => {
      const { data } = await transactionApi.getHistory(filters);
      return data.data;
    },
  });
}

/**
 * Initiates a peer-to-peer wallet transfer.
 */
export function useTransfer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: TransferRequest) =>
      transactionApi.transfer(payload).then((res) => res.data.data),
    onSuccess: (tx) => {
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      queryClient.invalidateQueries({ queryKey: TRANSACTIONS_QUERY_KEY });
      toast.success(`Transfer ${tx.referenceNumber} completed!`);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}
