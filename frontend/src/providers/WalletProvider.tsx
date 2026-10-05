"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { getWallet } from "@/lib/api";
import { POLL_INTERVAL_MS } from "@/lib/config";
import { describeError } from "@/lib/errors";
import { createBalanceSocket, type BalanceSocket, type SocketState } from "@/lib/balanceSocket";
import type { BalancePush, TransactionRow, WalletAccount, WalletView } from "@/lib/types";
import { useAuth } from "./AuthProvider";

/**
 * Owns the single copy of wallet truth on the client.
 *
 * There is exactly one place numbers enter this state: a 200 from
 * GET /api/wallet, or an after-commit push on /user/queue/balances. Nothing here
 * extrapolates, and nothing here moves a number because a button was pressed.
 */

export type WalletStatus = "idle" | "loading" | "ready" | "error";

interface WalletContextValue {
  data: WalletView | null;
  accounts: WalletAccount[];
  status: WalletStatus;
  error: string | null;
  /** True while a manual or silent GET /api/wallet is in flight. */
  refreshing: boolean;
  lastUpdated: Date | null;
  socket: SocketState;
  /** The socket is unusable, so we are polling instead. */
  polling: boolean;
  refresh: (options?: { silent?: boolean }) => Promise<void>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

const RECENT_LIMIT = 8;

function applyBalancePush(view: WalletView, push: BalancePush): WalletView {
  let touched = false;
  const accounts = view.accounts.map((account) => {
    if (account.id !== push.accountId) return account;
    touched = true;
    return {
      ...account,
      balance: push.balance,
      available: push.available ?? account.available,
      verifiedAt: push.verifiedAt ?? account.verifiedAt,
      currency: push.currency || account.currency,
    };
  });
  return touched ? { ...view, accounts } : view;
}

function applyTransactionPush(view: WalletView, row: TransactionRow): WalletView {
  if (view.recent.some((item) => item.reference === row.reference)) return view;
  return { ...view, recent: [row, ...view.recent].slice(0, RECENT_LIMIT) };
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const { status: sessionStatus, accessToken } = useAuth();
  const authenticated = sessionStatus === "authenticated";

  const [data, setData] = useState<WalletView | null>(null);
  const [status, setStatus] = useState<WalletStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [socket, setSocket] = useState<SocketState>("idle");

  const dataRef = useRef<WalletView | null>(null);
  const inflight = useRef<Promise<void> | null>(null);
  const accessTokenRef = useRef<string | null>(accessToken);
  accessTokenRef.current = accessToken;

  const commit = useCallback(
    (next: WalletView | ((prev: WalletView | null) => WalletView | null)) => {
      const resolved = typeof next === "function" ? next(dataRef.current) : next;
      dataRef.current = resolved;
      setData(resolved);
    },
    [],
  );

  const load = useCallback(
    async (options?: { silent?: boolean }): Promise<void> => {
      if (!authenticated) return;
      if (inflight.current) return inflight.current;

      if (!options?.silent) {
        setStatus((prev) => (prev === "ready" ? prev : "loading"));
        setRefreshing(true);
      }

      const request = getWallet()
        .then((view) => {
          commit(view);
          setError(null);
          setStatus("ready");
          setLastUpdated(new Date());
        })
        .catch((err: unknown) => {
          setError(describeError(err, "Wallet"));
          setStatus((prev) => (prev === "ready" ? prev : "error"));
        })
        .finally(() => {
          inflight.current = null;
          setRefreshing(false);
        });

      inflight.current = request;
      return request;
    },
    [authenticated, commit],
  );

  /* A new session (or a rotated token) resets the projection and refetches. */
  useEffect(() => {
    if (!authenticated) {
      dataRef.current = null;
      setData(null);
      setStatus("idle");
      setError(null);
      setLastUpdated(null);
      setSocket("idle");
      return;
    }
    void load();
  }, [authenticated, accessToken, load]);

  /* Realtime feed. Rebuilt when the token changes so CONNECT carries a valid JWT. */
  useEffect(() => {
    if (!authenticated || !accessToken) return;

    let disposed = false;
    let socketHandle: BalanceSocket | null = null;

    const handleState = (state: SocketState) => {
      if (disposed) return;
      setSocket(state);
      // Coming back live: drop the polled numbers for a single authoritative read.
      if (state === "live") void load({ silent: true });
    };

    socketHandle = createBalanceSocket({
      getAccessToken: () => accessTokenRef.current,
      onBalance: (push) => {
        if (disposed) return;
        commit((prev) => (prev ? applyBalancePush(prev, push) : prev));
        setLastUpdated(new Date());
      },
      onTransaction: (row) => {
        if (disposed) return;
        commit((prev) => (prev ? applyTransactionPush(prev, row) : prev));
        setLastUpdated(new Date());
      },
      onState: handleState,
    });
    socketHandle.start();

    return () => {
      disposed = true;
      socketHandle?.stop();
    };
  }, [authenticated, accessToken, commit, load]);

  /* Polling fallback: only while the socket is not carrying the numbers. */
  useEffect(() => {
    if (!authenticated) return;
    if (socket === "live") return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      void load({ silent: true });
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [authenticated, socket, load]);

  /* Coming back to a visible tab after a while: re-read rather than trust. */
  useEffect(() => {
    if (!authenticated) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void load({ silent: true });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [authenticated, load]);

  const value = useMemo<WalletContextValue>(
    () => ({
      data,
      accounts: data?.accounts ?? [],
      status,
      error,
      refreshing,
      lastUpdated,
      socket,
      polling: socket !== "live",
      refresh: load,
    }),
    [data, status, error, refreshing, lastUpdated, socket, load],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside <WalletProvider>");
  return ctx;
}

export type { SocketState };
