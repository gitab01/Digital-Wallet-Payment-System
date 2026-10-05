/** Backend origins. Overridable with NEXT_PUBLIC_* env vars, never required. */

const RAW_API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim().replace(/\/+$/, "") || "http://localhost:8080";

export const API_BASE = RAW_API_BASE;

/**
 * ws://localhost:8080/ws (or wss:// when the API base is https). STOMP over
 * WebSocket per the contract, with the JWT in the STOMP CONNECT header.
 */
export const WS_URL: string = (() => {
  const override = process.env.NEXT_PUBLIC_WS_URL?.trim();
  if (override) return override.replace(/\/+$/, "");
  const derived = API_BASE.replace(/^http/, "ws");
  return `${derived}/ws`;
})();

export const API_ORIGIN = API_BASE;

/** How often we poll GET /api/wallet while the socket is down. */
export const POLL_INTERVAL_MS = 10_000;

/** Debounce for the live transfer quote. */
export const QUOTE_DEBOUNCE_MS = 350;

export const STORAGE_KEYS = {
  tokens: "dw.tokens",
  email: "dw.email",
  /** The contract has no "GET /me": the profile from login/register is kept here. */
  user: "dw.user",
} as const;
