"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { walletApi } from "@/lib/api";
import { getErrorMessage } from "@/lib/utils";
import type { CreateWalletRequest, DepositRequest } from "@/types";
import toast from "react-hot-toast";

export const WALLETS_QUERY_KEY = ["wallets"] as const;

/**
 * Fetches all wallets for the authenticated user.
 */
export function useWallets() {
  return useQuery({
    queryKey: WALLETS_QUERY_KEY,
    queryFn: async () => {
      const { data } = await walletApi.getWallets();
      return data.data;
    },
  });
}

/**
 * Creates a new wallet mutation.
 */
export function useCreateWallet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateWalletRequest) =>
      walletApi.createWallet(payload).then((res) => res.data.data),
    onSuccess: (wallet) => {
      queryClient.invalidateQueries({ queryKey: WALLETS_QUERY_KEY });
      toast.success(`${wallet.currencyCode} wallet created!`);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}

/**
 * Deposit funds mutation.
 */
export function useDeposit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: DepositRequest) =>
      walletApi.deposit(payload).then((res) => res.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: WALLETS_QUERY_KEY });
      toast.success("Deposit successful!");
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}
