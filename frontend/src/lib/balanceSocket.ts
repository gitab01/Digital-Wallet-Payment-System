import { Client, type IFrame, type Message } from "@stomp/stompjs";

import { WS_URL } from "./config";
import type { BalancePush, TransactionRow } from "./types";

/**
 * STOMP over WebSocket to /ws with the JWT in the CONNECT header, subscribing to
 * the two user queues. Publishes happen only in an `afterCommit` synchronisation,
 * so nothing arriving here is speculative — but it is still only ever *merged*
 * into server truth from GET /api/wallet, never invented locally.
 */

export type SocketState = "idle" | "connecting" | "live" | "reconnecting" | "offline";

export interface BalanceSocketHandlers {
  getAccessToken: () => string | null;
  onBalance: (message: BalancePush) => void;
  onTransaction: (message: TransactionRow) => void;
  onState: (state: SocketState) => void;
}

export const BALANCES_DESTINATION = "/user/queue/balances";
export const TRANSACTIONS_DESTINATION = "/user/queue/transactions";

function parseJson<T>(frame: Message): T | null {
  try {
    const value = JSON.parse(frame.body) as unknown;
    return value && typeof value === "object" ? (value as T) : null;
  } catch {
    return null;
  }
}

function isBalancePush(value: BalancePush | null): value is BalancePush {
  return (
    !!value &&
    typeof value.accountId === "number" &&
    typeof value.currency === "string" &&
    typeof value.balance === "string"
  );
}

function isTransactionRow(value: TransactionRow | null): value is TransactionRow {
  return !!value && typeof value.reference === "string" && typeof value.amount === "string";
}

export interface BalanceSocket {
  start: () => void;
  stop: () => void;
}

export function createBalanceSocket(handlers: BalanceSocketHandlers): BalanceSocket {
  /**
   * The token can be rotated while the socket is asleep. Refreshing the CONNECT
   * header on every (re)attempt keeps a silent `/api/auth/refresh` from turning
   * the realtime feed into a permanently rejected connection.
   */
  const applyToken = () => {
    client.connectHeaders = { Authorization: `Bearer ${handlers.getAccessToken() ?? ""}` };
  };

  const client = new Client({
    brokerURL: WS_URL,
    connectHeaders: { Authorization: `Bearer ${handlers.getAccessToken() ?? ""}` },
    reconnectDelay: 4000,
    heartbeatIncoming: 10_000,
    heartbeatOutgoing: 10_000,
    debug: () => {
      /* silence the library's console chatter */
    },
    onConnect: () => {
      client.subscribe(BALANCES_DESTINATION, (frame: Message) => {
        const message = parseJson<BalancePush>(frame);
        if (isBalancePush(message)) handlers.onBalance(message);
      });
      client.subscribe(TRANSACTIONS_DESTINATION, (frame: Message) => {
        const message = parseJson<TransactionRow>(frame);
        if (isTransactionRow(message)) handlers.onTransaction(message);
      });
      handlers.onState("live");
    },
    onWebSocketClose: () => {
      applyToken();
      handlers.onState("reconnecting");
    },
    onStompError: (frame: IFrame) => {
      // A rejected CONNECT (bad/expired token) retries uselessly: say so plainly.
      const headers = frame.headers ?? {};
      const message = `${headers.MESSAGE ?? ""} ${headers.RECEIPT ?? ""}`.toLowerCase();
      handlers.onState(
        message.includes("authentication") || message.includes("unauthorized")
          ? "offline"
          : "reconnecting",
      );
    },
  });

  return {
    start() {
      if (client.active || client.connected) return;
      applyToken();
      handlers.onState("connecting");
      client.activate();
    },
    stop() {
      client.deactivate().catch(() => undefined);
      handlers.onState("idle");
    },
  };
}
