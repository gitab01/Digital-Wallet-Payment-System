import { ApiError, parseEnvelope } from "./errors";
import { API_ORIGIN, STORAGE_KEYS } from "./config";
import type {
  AdminAuditEvent,
  AdminClientDetail,
  AdminClientRow,
  AdminClientStatus,
  AdminClientUser,
  ApiErrorEnvelope,
  AuditPage,
  AuditQuery,
  AuthResponse,
  ChangePinRequest,
  ClientListQuery,
  DocumentSide,
  DownloadedFile,
  FundingRequest,
  KycDocumentSummary,
  KycDocumentUpload,
  KycQueueEntry,
  KycUpgradeRequest,
  KycView,
  LoginRequest,
  Page,
  PublicUser,
  QuoteQuery,
  ReconcileReport,
  RegisterRequest,
  StatementQuery,
  Tokens,
  TransactionDetail,
  TransactionFilters,
  TransactionRow,
  TransferQuote,
  TransferRequest,
  TransferResult,
  WalletAccount,
  WalletView,
} from "./types";

/* --------------------------------------------------------------------------
 * Session plumbing.
 *
 * The HTTP layer must not know about React, so AuthProvider registers hooks at
 * mount. Two distinct 401 policies, straight from the brief:
 *   silent      - reads & navigation: refresh the token and replay transparently.
 *   interactive - anything that moves money or changes credentials: the session
 *                 is dead for authorisation purposes, so re-prompt for a password
 *                 and only replay if the user proves themselves again.
 * ------------------------------------------------------------------------ */

export type SessionPolicy = "none" | "silent" | "interactive";

export interface ApiHooks {
  getAccessToken: () => string | null;
  /** Refreshes the session; resolves true when a usable access token exists. */
  refreshSession: () => Promise<boolean>;
  /** Re-prompts the user; resolves true when they re-authenticated. */
  reauthenticate: () => Promise<boolean>;
}

let hooks: ApiHooks | null = null;

export function configureApiHooks(next: ApiHooks | null): void {
  hooks = next;
}

function accessToken(): string | null {
  return hooks?.getAccessToken() ?? null;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /**
   * Multipart body for `POST /api/kyc/documents`. Never paired with `body`: the
   * browser must set Content-Type itself, with the boundary, so we send no header.
   */
  form?: FormData;
  query?: Record<string, string | number | undefined | null>;
  /** Attach the bearer token. Defaults to true. */
  auth?: boolean;
  /** Overrides `Accept` for routes that return bytes rather than JSON. */
  accept?: string;
  session?: SessionPolicy;
  signal?: AbortSignal;
  /**
   * How long to wait for a response before giving up. A host that accepts the TCP
   * connection and then answers nothing — Render sleeping, or a container stuck
   * restarting — would otherwise leave the request, and the button, hanging forever.
   */
  timeoutMs?: number;
}

export class AbortedError extends Error {
  constructor() {
    super("Request aborted");
    this.name = "AbortedError";
  }
}

/** A read that has not answered in 20 seconds is not going to answer. */
const REQUEST_TIMEOUT_MS = 20_000;

/**
 * A movement that times out is not a movement that failed: the server may well have
 * committed it after the client stopped listening, which is exactly what happened to a
 * 42.50 ETB transfer during development. So a write waits far longer, and when it does
 * give up the message says "we do not know" rather than "nothing happened".
 */
const WRITE_TIMEOUT_MS = 180_000;

/** Uploads and downloads carry up to 8 MB of identity image, so they get longer. */
const FILE_TIMEOUT_MS = 120_000;

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = new URL(path.startsWith("/") ? path : `/${path}`, API_ORIGIN);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function send(path: string, opts: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { Accept: opts.accept ?? "application/json" };
  const token = opts.auth === false ? null : accessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const init: RequestInit = { method: opts.method ?? "GET", headers, cache: "no-store" };
  if (opts.form) {
    // Deliberately no Content-Type here: a hand-written one has no boundary and
    // the server can then not split the parts at all.
    init.body = opts.form;
  } else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(opts.body);
  }
  // The timeout is its own signal, joined with any the caller passed, so the two
  // failure modes stay distinguishable in the catch below.
  const isRead = (opts.method ?? "GET") === "GET";
  const timeout = AbortSignal.timeout(
    opts.timeoutMs ?? (isRead ? REQUEST_TIMEOUT_MS : WRITE_TIMEOUT_MS)
  );
  init.signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;

  try {
    return await fetch(buildUrl(path, opts.query), init);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw new AbortedError();
    throw new ApiError({
      status: 0,
      code: "NETWORK_ERROR",
      message: "Network request failed",
      details: timeout.aborted ? { reason: "timeout", outcome: isRead ? "none" : "unknown" } : null,
    });
  }
}

async function readEnvelope(res: Response): Promise<ApiErrorEnvelope | null> {
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("json")) return null;
  try {
    return (await res.json()) as ApiErrorEnvelope;
  } catch {
    return null;
  }
}

function retryAfter(res: Response): number | null {
  const raw = res.headers.get("retry-after");
  if (!raw) return null;
  const seconds = Number(raw);
  return Number.isFinite(seconds) ? seconds : null;
}

function errorFrom(res: Response, envelope: ApiErrorEnvelope | null): ApiError {
  if (envelope?.code) {
    return parseEnvelope(res.status, envelope, retryAfter(res));
  }
  return new ApiError({
    status: res.status,
    code: res.status === 401 ? "AUTH_REQUIRED" : "UNEXPECTED_RESPONSE",
    message: res.ok ? "" : `Request failed with status ${res.status}`,
    retryAfterSeconds: retryAfter(res),
  });
}

function isSessionFailure(envelope: ApiErrorEnvelope | null): boolean {
  return envelope?.code === "TOKEN_EXPIRED" || envelope?.code === "AUTH_REQUIRED";
}

/**
 * A recoverable 401 is a `TOKEN_EXPIRED`/`AUTH_REQUIRED`; a `PIN_INVALID` is also
 * a 401 and must fall straight through to the caller with its `attemptsLeft`.
 */
async function requestRaw(
  path: string,
  opts: RequestOptions,
): Promise<{ res: Response; envelope: ApiErrorEnvelope | null }> {
  const session = opts.session ?? "silent";
  let res = await send(path, opts);
  let envelope = res.ok ? null : await readEnvelope(res);

  if (res.status === 401 && session !== "none" && isSessionFailure(envelope)) {
    const restored =
      session === "interactive"
        ? await (hooks?.reauthenticate() ?? Promise.resolve(false))
        : await (hooks?.refreshSession() ?? Promise.resolve(false));

    if (restored) {
      res = await send(path, opts);
      envelope = res.ok ? null : await readEnvelope(res);
    }
  }
  return { res, envelope };
}

async function requestJson<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { res, envelope } = await requestRaw(path, opts);
  if (!res.ok) throw errorFrom(res, envelope);
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return undefined as T;
  }
  try {
    return (await res.json()) as T;
  } catch {
    throw new ApiError({
      status: res.status,
      code: "UNEXPECTED_RESPONSE",
      message: "Response body was not JSON",
    });
  }
}

/**
 * Bytes rather than JSON: an identity image can only be shown with the
 * Authorization header attached, so a plain `<img src>` cannot be used.
 */
async function requestBlob(path: string, opts: RequestOptions = {}): Promise<Blob> {
  const { res, envelope } = await requestRaw(path, {
    accept: "image/jpeg",
    timeoutMs: FILE_TIMEOUT_MS,
    ...opts,
  });
  if (!res.ok) {
    throw errorFrom(
      res,
      envelope ?? {
        code: "UNEXPECTED_RESPONSE",
        message: `Image request failed with status ${res.status}`,
        details: null,
      },
    );
  }
  return res.blob();
}

/* ------------------------------------------------------------------- auth -- */

export interface RefreshResponse {
  tokens: Tokens;
  user?: AuthResponse["user"];
}

/** `POST /api/auth/refresh` never consults the hooks (it *is* the recovery). */
export async function login(body: LoginRequest): Promise<AuthResponse> {
  return requestJson<AuthResponse>("/api/auth/login", {
    method: "POST",
    body,
    auth: false,
    session: "none",
  });
}

export async function register(body: RegisterRequest): Promise<AuthResponse> {
  return requestJson<AuthResponse>("/api/auth/register", {
    method: "POST",
    body,
    auth: false,
    session: "none",
  });
}

export async function refreshSession(refreshToken: string): Promise<RefreshResponse> {
  return requestJson<RefreshResponse>("/api/auth/refresh", {
    method: "POST",
    body: { refreshToken },
    auth: false,
    session: "none",
  });
}

export async function logout(refreshToken: string | null): Promise<void> {
  if (!refreshToken) return;
  await requestJson<void>("/api/auth/logout", {
    method: "POST",
    body: { refreshToken },
    auth: false,
    session: "none",
  });
}

/* ----------------------------------------------------------------- wallet -- */

export function getWallet(signal?: AbortSignal): Promise<WalletView> {
  return requestJson<WalletView>("/api/wallet", { signal });
}

export function openAccount(currency: string): Promise<WalletAccount> {
  return requestJson<WalletAccount>("/api/accounts", { method: "POST", body: { currency } });
}

/* -------------------------------------------------------------- transfers -- */

/**
 * Pre-flight, no PIN. `silent` session policy: refreshing a quote mid-typing
 * must never interrupt the user, and it moves no money.
 */
export async function getQuote(
  query: QuoteQuery,
  signal?: AbortSignal,
): Promise<TransferQuote> {
  return requestJson<TransferQuote>("/api/transfers/quote", {
    query: { ...query },
    signal,
  });
}

/** Money movement: a stale token must re-prompt, never silently replay. */
export function createTransfer(body: TransferRequest): Promise<TransferResult> {
  return requestJson<TransferResult>("/api/transfers", {
    method: "POST",
    body,
    session: "interactive",
  });
}

export function deposit(body: FundingRequest): Promise<TransferResult> {
  return requestJson<TransferResult>("/api/funds/deposit", {
    method: "POST",
    body,
    session: "interactive",
  });
}

export function withdraw(body: FundingRequest): Promise<TransferResult> {
  return requestJson<TransferResult>("/api/funds/withdraw", {
    method: "POST",
    body,
    session: "interactive",
  });
}

/* -------------------------------------------------- history & statements -- */

export function listTransactions(
  filters: TransactionFilters,
  signal?: AbortSignal,
): Promise<Page<TransactionRow>> {
  return requestJson<Page<TransactionRow>>("/api/transactions", {
    query: {
      accountId: filters.accountId,
      from: filters.from,
      to: filters.to,
      page: filters.page,
      size: filters.size,
    },
    signal,
  });
}

export function getTransaction(reference: string, signal?: AbortSignal): Promise<TransactionDetail> {
  return requestJson<TransactionDetail>(
    `/api/transactions/${encodeURIComponent(reference)}`,
    { signal },
  );
}

function filenameFrom(res: Response, fallback: string): string {
  const disposition = res.headers.get("content-disposition") ?? "";
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  const plain = /filename="?([^";]+)"?/i.exec(disposition);
  const raw = utf8?.[1] ?? plain?.[1];
  if (!raw) return fallback;
  try {
    return decodeURIComponent(raw.trim());
  } catch {
    return raw.trim();
  }
}

/** `GET /api/statements` streams a file; errors still come back as JSON. */
export async function downloadStatement(query: StatementQuery): Promise<DownloadedFile> {
  const path = "/api/statements";
  const opts: RequestOptions = {
    query: { ...query },
    timeoutMs: FILE_TIMEOUT_MS,
  };
  const { res, envelope } = await requestRaw(path, opts);
  const contentType = res.headers.get("content-type") ?? "";

  if (!res.ok) {
    if (!envelope) {
      throw new ApiError({
        status: res.status,
        code: "UNEXPECTED_RESPONSE",
        message: `Statement request failed with status ${res.status}`,
      });
    }
    throw errorFrom(res, envelope);
  }
  if (contentType.includes("json")) {
    throw new ApiError({
      status: res.status,
      code: "UNEXPECTED_RESPONSE",
      message: "The statement endpoint returned JSON instead of a file",
    });
  }
  const blob = await res.blob();
  return {
    blob,
    filename: filenameFrom(res, `statement-${query.accountId}-${query.from}-${query.to}.${query.format}`),
    contentType,
  };
}

export function triggerDownload(file: DownloadedFile): void {
  const url = URL.createObjectURL(file.blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/* -------------------------------------------------------------------- kyc -- */

export function getKyc(): Promise<KycView> {
  return requestJson<KycView>("/api/kyc");
}

export function submitKycUpgrade(body: KycUpgradeRequest): Promise<KycView> {
  return requestJson<KycView>("/api/kyc", { method: "POST", body });
}

/**
 * `POST /api/kyc/documents` — one side per call, attached to the caller's newest
 * SUBMITTED submission. A silent policy is right here: it changes no money, and a
 * token that expires mid-upload should replay rather than interrupt onboarding.
 */
export function uploadKycDocument(side: DocumentSide, file: File): Promise<KycDocumentUpload> {
  const form = new FormData();
  form.append("side", side);
  form.append("file", file, file.name);
  return requestJson<KycDocumentUpload>("/api/kyc/documents", {
    method: "POST",
    form,
    timeoutMs: FILE_TIMEOUT_MS,
  });
}

/**
 * The bytes behind one stored document. Every server-side read of this route is
 * audited, which is how "who looked at this customer's ID" stays answerable.
 */
export function getKycDocumentImage(id: number, signal?: AbortSignal): Promise<Blob> {
  return requestBlob(`/api/kyc/documents/${id}/image`, { signal });
}

/** Operations-only (`ROLE_REVIEWER`). Drives tier and limits. */
export function decideKycSubmission(id: number, approve: boolean): Promise<KycView> {
  return requestJson<KycView>(`/api/kyc/${id}/decision`, {
    method: "POST",
    body: { approve },
  });
}

/* ------------------------------------------------------ operations console -- */

/**
 * Every route below is `ROLE_REVIEWER` at the server. The session policy stays
 * `silent` so an expired token refreshes, but a genuine 403 is not a session
 * problem and must reach the page as an error it can explain.
 */
export function getKycQueue(signal?: AbortSignal): Promise<KycQueueEntry[]> {
  return requestJson<KycQueueEntry[]>("/api/admin/kyc-queue", { signal });
}

export function getKycRecordDocuments(recordId: number, signal?: AbortSignal): Promise<KycDocumentSummary[]> {
  return requestJson<KycDocumentSummary[]>(`/api/admin/kyc/${recordId}/documents`, { signal });
}

export function listClients(
  query: ClientListQuery,
  signal?: AbortSignal,
): Promise<Page<AdminClientRow>> {
  return requestJson<Page<AdminClientRow>>("/api/admin/clients", {
    query: { query: query.query, status: query.status, page: query.page, size: query.size },
    signal,
  });
}

export function getClient(id: number, signal?: AbortSignal): Promise<AdminClientDetail> {
  return requestJson<AdminClientDetail>(`/api/admin/clients/${id}`, { signal });
}

/** A suspended account cannot sign in or move money — the UI confirms first. */
export function setClientStatus(id: number, status: AdminClientStatus): Promise<AdminClientUser> {
  return requestJson<AdminClientUser>(`/api/admin/clients/${id}/status`, {
    method: "POST",
    body: { status },
  });
}

/** Narrower than suspension: cash-out stops, transfers and top-ups keep working. */
export function setClientWithdrawalFreeze(id: number, frozen: boolean): Promise<void> {
  return requestJson<void>(`/api/admin/clients/${id}/withdrawal-freeze`, {
    method: "POST",
    body: { frozen },
  });
}

export function unlockClientPin(id: number): Promise<void> {
  return requestJson<void>(`/api/admin/clients/${id}/pin-unlock`, { method: "POST" });
}

export function listAdminAudit(query: AuditQuery, signal?: AbortSignal): Promise<Page<AdminAuditEvent>> {
  return requestJson<Page<AdminAuditEvent>>("/api/admin/audit", {
    query: { action: query.action, page: query.page, size: query.size },
    signal,
  });
}

/**
 * `repair=true` moves a projection to match the ledger, so the caller asks for it
 * through its own separate confirmation — the same button never does both.
 */
export function reconcile(repair: boolean): Promise<ReconcileReport> {
  return requestJson<ReconcileReport>("/api/admin/reconcile", {
    method: "POST",
    query: { repair: repair ? "true" : "false" },
  });
}

/* -------------------------------------------------------------- security -- */

export function changePin(body: ChangePinRequest): Promise<void> {
  return requestJson<void>("/api/me/pin", {
    method: "POST",
    body,
    session: "interactive",
  });
}

export function getAuditEvents(): Promise<AuditPage> {
  return requestJson<AuditPage>("/api/me/audit");
}

/* --------------------------------------------------------- token storage -- */

export function readStoredTokens(): Tokens | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.tokens);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Tokens>;
    if (typeof parsed.accessToken !== "string" || typeof parsed.refreshToken !== "string") {
      return null;
    }
    return {
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      expiresIn: typeof parsed.expiresIn === "number" ? parsed.expiresIn : 900,
      tokenType: typeof parsed.tokenType === "string" ? parsed.tokenType : "Bearer",
    };
  } catch {
    return null;
  }
}

export function storeTokens(tokens: Tokens | null): void {
  if (typeof window === "undefined") return;
  try {
    if (tokens) window.localStorage.setItem(STORAGE_KEYS.tokens, JSON.stringify(tokens));
    else window.localStorage.removeItem(STORAGE_KEYS.tokens);
  } catch {
    /* private mode / quota: session stays in memory only */
  }
}

export function readStoredEmail(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_KEYS.email);
}

export function storeEmail(email: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (email) window.localStorage.setItem(STORAGE_KEYS.email, email);
    else window.localStorage.removeItem(STORAGE_KEYS.email);
  } catch {
    /* ignore */
  }
}

/**
 * The contract has no session-profile endpoint, so the `user` returned by
 * login/register is the only source of the display name and tier after a reload.
 * This is presentation state only — every number on screen still comes from a
 * fresh authenticated call.
 */
export function readStoredUser(): PublicUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.user);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PublicUser>;
    if (
      typeof parsed.id !== "number" ||
      typeof parsed.email !== "string" ||
      typeof parsed.fullName !== "string" ||
      typeof parsed.kycTier !== "number"
    ) {
      return null;
    }
    return {
      id: parsed.id,
      email: parsed.email,
      fullName: parsed.fullName,
      kycTier: parsed.kycTier,
      status: typeof parsed.status === "string" ? parsed.status : "UNKNOWN",
    };
  } catch {
    return null;
  }
}

export function storeUser(user: PublicUser | null): void {
  if (typeof window === "undefined") return;
  try {
    if (user) window.localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(user));
    else window.localStorage.removeItem(STORAGE_KEYS.user);
  } catch {
    /* private mode / quota: the profile simply stays in memory */
  }
}

/**
 * Claims read without verifying the signature. Cheap and deliberately
 * non-authoritative: it exists to decide what to show, never what to allow.
 */
function jwtPayload(token: string | null | undefined): Record<string, unknown> | null {
  if (!token) return null;
  const [, payload] = token.split(".");
  if (!payload) return null;
  try {
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as Record<
      string,
      unknown
    >;
  } catch {
    return null;
  }
}

/** Cheap, non-authoritative expiry claim check on the JWT `exp`. */
export function tokenExpiryMs(tokens: Tokens | null): number | null {
  const exp = jwtPayload(tokens?.accessToken)?.exp;
  return typeof exp === "number" ? exp * 1000 : null;
}

/**
 * The JWT `roles` claim. Used only to decide whether to offer the operations
 * console at all — `ROLE_REVIEWER` is still enforced on every admin route, so a
 * tampered claim gets a 403 here rather than a decision.
 */
export function tokenRoles(accessToken: string | null | undefined): string[] {
  const claim = jwtPayload(accessToken)?.roles;
  if (Array.isArray(claim)) return claim.filter((role): role is string => typeof role === "string");
  return typeof claim === "string" ? [claim] : [];
}
