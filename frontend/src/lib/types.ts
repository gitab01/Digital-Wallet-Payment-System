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

export const DOCUMENT_TYPES = ["NATIONAL_ID", "PASSPORT", "DRIVING_LICENSE"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/** An identity document is photographed on one side (passport) or both. */
export const DOCUMENT_SIDES = ["FRONT", "BACK"] as const;
export type DocumentSide = (typeof DOCUMENT_SIDES)[number];

/**
 * A national ID and a licence are read on both sides; a passport is verified from
 * its single information page. The review desk refuses to approve without them.
 */
export const REQUIRED_SIDES: Record<DocumentType, readonly DocumentSide[]> = {
  NATIONAL_ID: ["FRONT", "BACK"],
  DRIVING_LICENSE: ["FRONT", "BACK"],
  PASSPORT: ["FRONT"],
};

export const DOCUMENT_TYPE_LABEL: Record<DocumentType, string> = {
  NATIONAL_ID: "National ID",
  PASSPORT: "Passport",
  DRIVING_LICENSE: "Driving licence",
};

/** Unknown codes come back from the server verbatim rather than crashing a label. */
export function documentTypeLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return DOCUMENT_TYPE_LABEL[value as DocumentType] ?? value.replace(/_/g, " ");
}

export function requiredSidesFor(value: string | null | undefined): DocumentSide[] {
  if (!value) return [...DOCUMENT_SIDES];
  return [...(REQUIRED_SIDES[value as DocumentType] ?? ["FRONT"])];
}

/** A side maps to the stored document id, or null while it has not been uploaded. */
export type DocumentSideMap = Partial<Record<DocumentSide, number | null>>;

/**
 * Upload limits from `POST /api/kyc/documents`. Checked before a byte leaves the
 * device so a 30 MB camera roll photo fails locally instead of on the network.
 */
export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png"] as const;

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

export type KycStatus = "PENDING" | "APPROVED" | "REJECTED" | "SUBMITTED" | string;

export interface KycDocument {
  tier: number;
  /** The submission these sides belong to — `POST /api/kyc/{id}/decision` takes it. */
  recordId: number;
  documentType: DocumentType | string;
  last4: string;
  status: KycStatus;
  submittedAt: IsoDateTime;
  /** Which sides exist already, and the stored document id behind each. */
  sides: DocumentSideMap;
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

/** `POST /api/kyc/documents` — one side, one file, one call. */
export interface KycDocumentUpload {
  id: number;
  recordId: number;
  side: DocumentSide;
  byteLength: number;
  uploadedAt: IsoDateTime;
}

/** One entry from `GET /api/admin/kyc/{recordId}/documents`. */
export interface KycDocumentSummary {
  id: number;
  side: DocumentSide;
  byteLength: number;
  uploadedAt: IsoDateTime;
}

/* ------------------------------------------------- operations console -- */

/**
 * A row of `GET /api/admin/kyc-queue`. `missing` is server-side truth about the
 * sides, and the two warning flags are why the desk reads images, not numbers.
 */
export interface KycQueueEntry {
  recordId: number;
  userId: number;
  tier: number;
  email: string;
  fullName: string;
  documentType: DocumentType | string;
  last4: string;
  submittedAt: IsoDateTime;
  missing: DocumentSide[];
  /** Another customer already filed a scan with the same pixel content. */
  duplicateOfUserId: number | null;
  /** The signed-in reviewer is the subject, and cannot decide their own file. */
  ownSubmission: boolean;
}

/** Balance is always per currency — this client never adds ETB to USD. */
export interface ClientWalletBalance {
  currency: CurrencyCode;
  balance: Money;
}

export interface AdminClientRow {
  id: number;
  email: string;
  fullName: string;
  kycTier: number;
  status: UserStatus;
  withdrawalsFrozen: boolean;
  createdAt: IsoDateTime;
  wallets: ClientWalletBalance[];
}

/** `GET /api/admin/clients/{id}` adds the PIN-lock detail to the same shape. */
export interface AdminClientUser extends AdminClientRow {
  failedPinAttempts: number;
  pinLockedUntil: IsoDateTime | null;
}

export interface AdminClientDetail {
  user: AdminClientUser;
  wallets: ClientWalletBalance[];
  limits: LimitSummary;
  kyc: KycDocument[];
  recent: TransactionRow[];
}

export type AdminClientStatus = "ACTIVE" | "SUSPENDED";

export interface ClientListQuery {
  query?: string;
  status?: string;
  page?: number;
  size?: number;
}

export interface AdminAuditEvent {
  id: number;
  userEmail: string | null;
  action: AuditAction;
  outcome: string;
  ipAddress: string | null;
  createdAt: IsoDateTime;
  detail: string | null;
}

export interface AuditQuery {
  action?: string;
  page?: number;
  size?: number;
}

/**
 * API.md fixes the request but not the body of `POST /api/admin/reconcile`, so the
 * report stays open: the desk prints the keys it recognises and any other scalar
 * it was sent, which means the backend can enrich it without a client change.
 */
export type ReconcileReport = Record<string, unknown>;

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
  /* documents & operations */
  | "UNSUPPORTED_IMAGE"
  | "FILE_TOO_LARGE"
  | "NO_OPEN_SUBMISSION"
  | "DOCUMENTS_INCOMPLETE"
  | "ACCESS_DENIED"
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

/** `details` for DOCUMENTS_INCOMPLETE: the sides that blocked the approval. */
export interface MissingSidesDetails {
  missing?: DocumentSide[] | string[];
}

export interface DownloadedFile {
  blob: Blob;
  filename: string;
  contentType: string;
}
