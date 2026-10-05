/**
 * Types for every payload defined in API.md.
 *
 * Money is `Money` (a JSON string with exactly two decimals). It is NEVER parsed
 * into a float for arithmetic anywhere in this client — only formatted.
 */

export type Money = string;
export type IsoDateTime = string;
export type IsoDate = string; // yyyy-mm-dd

/**
 * The contract names `ETB`, `USD` and `EUR` but treats currency as an ISO code,
 * and `POST /api/accounts` can open any of them. Kept as a string so the client
 * never crashes on a code the backend adds later; `KNOWN_CURRENCIES` drives the
 * pickers.
 */
export type CurrencyCode = string;

export const KNOWN_CURRENCIES = ["ETB", "USD", "EUR"] as const;

export const DOCUMENT_TYPES = ["NATIONAL_ID", "PASSPORT"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/* ------------------------------------------------------------------ auth -- */

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
}

export type UserStatus = "PENDING_KYC" | "ACTIVE" | "SUSPENDED" | "CLOSED" | string;

export interface PublicUser {
  id: number;
  email: string;
  fullName: string;
  kycTier: number;
  status: UserStatus;
}

export interface AuthResponse {
  user: PublicUser;
  tokens: Tokens;
}

export interface RegisterRequest {
  email: string;
  fullName: string;
  password: string;
  /** Exactly 4 digits. */
  pin: string;
  phone: string;
  dateOfBirth: IsoDate;
  country: string;
  documentType: DocumentType;
  documentNumber: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

/* ---------------------------------------------------------------- wallet -- */

export interface WalletAccount {
  id: number;
  currency: CurrencyCode;
  label: string;
  balance: Money;
  available: Money;
  verifiedAt: IsoDateTime | null;
  /**
   * The "verified" indicator: the last time this account's projection was proved
   * against the ledger.
   */
  reconciled: boolean;
}

export interface LimitSummary {
  perTransaction: Money;
  daily: Money;
  monthly: Money;
  spentToday: Money;
  spentThisMonth: Money;
  remainingToday: Money;
  allowsWithdrawal: boolean;
}

export type TransactionType =
  | "TRANSFER"
  | "DEPOSIT"
  | "WITHDRAWAL"
  | "FEE"
  | "ADJUSTMENT"
  | "OPENING"
  | string;

export type TransactionDirection = "IN" | "OUT";

export type TransactionStatus =
  | "PENDING"
  | "COMPLETED"
  | "FAILED"
  | "REVERSED"
  | "REVIEW"
  | string;

/** Row shape used by `wallet.recent` and `transactions.items`. */
export interface TransactionRow {
  reference: string;
  type: TransactionType;
  direction: TransactionDirection;
  currency: CurrencyCode;
  amount: Money;
  fee: Money;
  status: TransactionStatus;
  occurredAt: IsoDateTime;
  counterparty: string | null;
  reviewFlag: boolean;
}

export interface WalletView {
  accounts: WalletAccount[];
  tier: number;
  limits: LimitSummary;
  withdrawalsFrozen: boolean;
  recent: TransactionRow[];
}

/* ------------------------------------------------------------ transfers -- */

export interface QuoteQuery {
  toEmail: string;
  currency: CurrencyCode;
  amount: Money;
}

export type QuoteDenial =
  | "INSUFFICIENT_FUNDS"
  | "LIMIT_EXCEEDED"
  | "CURRENCY_MISMATCH"
  | "SELF_TRANSFER"
  | "WITHDRAWALS_FROZEN";

export interface TransferQuote {
  recipientName: string;
  fee: Money;
  totalDebit: Money;
  senderBalanceAfter: Money;
  recipientBalanceAfter: Money;
  remainingToday: Money;
  allowed: boolean;
  reason: QuoteDenial | null;
}

export interface TransferRequest {
  toEmail: string;
  currency: CurrencyCode;
  amount: Money;
  pin: string;
  idempotencyKey: string;
}

/** `POST /api/funds/deposit` and `/withdraw` take the same shape minus `toEmail`. */
export interface FundingRequest {
  currency: CurrencyCode;
  amount: Money;
  pin: string;
  idempotencyKey: string;
}

export interface TransferResult {
  reference: string;
  status: TransactionStatus;
  replayed: boolean;
  amount: Money;
  fee: Money;
  currency: CurrencyCode;
  occurredAt: IsoDateTime;
  reviewFlag: boolean;
  senderBalance: Money;
  recipientName: string | null;
}

/* -------------------------------------------------- history & statements -- */

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}

export interface TransactionFilters {
  accountId?: number;
  from?: IsoDate;
  to?: IsoDate;
  page?: number;
  size?: number;
}

export interface LedgerEntry {
  id: number;
  accountId: number;
  accountLabel: string;
  amount: Money;
  role: "DEBIT" | "CREDIT" | string;
  balanceAfter: Money;
  createdAt: IsoDateTime;
}

export interface TransactionDetail extends TransactionRow {
  ledgerEntryIds: number[];
  senderAccountId: number | null;
  recipientAccountId: number | null;
  initiatedAt: IsoDateTime;
  completedAt: IsoDateTime | null;
  anomalyScore: number | null;
  entries: LedgerEntry[];
}

export type StatementFormat = "csv" | "pdf";

export interface StatementQuery {
  accountId: number;
  from: IsoDate;
  to: IsoDate;
  format: StatementFormat;
}

/* ------------------------------------------------------------------ kyc -- */

export type KycStatus = "PENDING" | "APPROVED" | "REJECTED" | string;

export interface KycDocument {
  tier: number;
  documentType: DocumentType | string;
  last4: string;
  status: KycStatus;
  submittedAt: IsoDateTime;
}

export interface KycView {
  tier: number;
  status: KycStatus;
  submittedAt: IsoDateTime | null;
  reviewedAt: IsoDateTime | null;
  documents: KycDocument[];
  limits: LimitSummary;
  nextTier: number | null;
}

export interface KycUpgradeRequest {
  documentType: DocumentType;
  documentNumber: string;
  phone: string;
  dateOfBirth: IsoDate;
  country: string;
}

/* -------------------------------------------------------------- security -- */

export interface ChangePinRequest {
  currentPin: string;
  newPin: string;
}

export type AuditAction =
  | "LOGIN"
  | "PIN_FAILURE"
  | "LIMIT_BREACH"
  | "TRANSFER"
  | string;

export interface AuditEvent {
  action: AuditAction;
  outcome: string;
  ipAddress: string | null;
  createdAt: IsoDateTime;
  detail: string | null;
}

export interface AuditPage {
  items: AuditEvent[];
}

/* ------------------------------------------------------------ websocket -- */

/** `/user/queue/balances` — published only after commit. */
export interface BalancePush {
  accountId: number;
  currency: CurrencyCode;
  balance: Money;
  available: Money;
  verifiedAt: IsoDateTime | null;
  reference: string | null;
  occurredAt: IsoDateTime;
}

/** `/user/queue/transactions` — the transaction row behind a new movement. */
export type TransactionPush = TransactionRow;

/* --------------------------------------------------------------- errors -- */

/**
 * Machine-readable codes from API.md. Union of the documented codes plus
 * `string` so an unknown code degrades to a generic-but-honest message instead
 * of typing itself into a corner.
 */
export type ApiErrorCode =
  | "VALIDATION_FAILED"
  | "PIN_REQUIRED"
  | "INVALID_AMOUNT"
  | "AUTH_REQUIRED"
  | "BAD_CREDENTIALS"
  | "TOKEN_EXPIRED"
  | "PIN_INVALID"
  | "WITHDRAWALS_FROZEN"
  | "ACCOUNT_NOT_ACTIVE"
  | "LIMIT_EXCEEDED"
  | "PIN_LOCKED"
  | "ACCOUNT_NOT_FOUND"
  | "USER_NOT_FOUND"
  | "TRANSFER_NOT_FOUND"
  | "ALREADY_ONBOARDED"
  | "SELF_TRANSFER"
  | "CURRENCY_MISMATCH"
  | "INSUFFICIENT_FUNDS"
  | "RATE_LIMITED"
  | "EMAIL_TAKEN"
  | "NETWORK_ERROR"
  | "UNEXPECTED_RESPONSE"
  | string;

export interface ApiErrorEnvelope {
  code: ApiErrorCode;
  message: string;
  details?: Record<string, unknown> | null;
  traceId?: string | null;
}

/** `details` for PIN_INVALID. */
export interface AttemptsLeftDetails {
  attemptsLeft?: number;
}

/** `details` for PIN_LOCKED. */
export interface PinLockedDetails {
  unlockedAt?: IsoDateTime;
}

/** `details` for LIMIT_EXCEEDED. */
export interface LimitDetails {
  limit?: Money;
  spent?: Money;
}

export interface DownloadedFile {
  blob: Blob;
  filename: string;
  contentType: string;
}
