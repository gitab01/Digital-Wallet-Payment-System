import { formatAmountOrDash, formatDateTime } from "./money";
import type {
  ApiErrorEnvelope,
  ApiErrorCode,
  AttemptsLeftDetails,
  LimitDetails,
  MissingSidesDetails,
  PinLockedDetails,
} from "./types";

/**
 * Every non-2xx response is `{ code, message, details, traceId }`. `code` is
 * stable, so the UI switches on the code and never shows a bare
 * "something went wrong". `message` is only ever used as a fallback tail.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details: Record<string, unknown> | null;
  readonly traceId: string | null;
  /** Parsed for RATE_LIMITED when the backend sends Retry-After. */
  readonly retryAfterSeconds: number | null;

  constructor(args: {
    status: number;
    code: ApiErrorCode;
    message: string;
    details?: Record<string, unknown> | null;
    traceId?: string | null;
    retryAfterSeconds?: number | null;
  }) {
    super(args.message);
    this.name = "ApiError";
    this.status = args.status;
    this.code = args.code;
    this.details = args.details ?? null;
    this.traceId = args.traceId ?? null;
    this.retryAfterSeconds = args.retryAfterSeconds ?? null;
  }

  static is(err: unknown): err is ApiError {
    return err instanceof ApiError;
  }

  get isNetworkError(): boolean {
    return this.code === "NETWORK_ERROR";
  }

  /**
   * True when we stopped waiting on a request that changes state. The server may still
   * commit it, so nothing that reads this may promise the money did not move.
   */
  get outcomeIsUnknown(): boolean {
    return (
      this.code === "NETWORK_ERROR" &&
      (this.details as { outcome?: string } | null)?.outcome === "unknown"
    );
  }
}

function asNumber(details: Record<string, unknown> | null, key: string): number | null {
  const raw = details?.[key];
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "" && !Number.isNaN(Number(raw))) {
    return Number(raw);
  }
  return null;
}

function asString(details: Record<string, unknown> | null, key: string): string | null {
  const raw = details?.[key];
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

/** `DOCUMENTS_INCOMPLETE` lists the blocking sides; say which ones instead of guessing. */
function missingSideNames(details: Record<string, unknown> | null): string | null {
  const raw = (details as MissingSidesDetails | null)?.missing;
  const sides = Array.isArray(raw)
    ? raw.filter((side): side is string => typeof side === "string" && side.length > 0)
    : [];
  if (sides.length === 0) return null;
  return sides.map((side) => side.toLowerCase().replace(/_/g, " ")).join(", ");
}

export function describeError(err: unknown, fallbackContext?: string): string {
  if (!(err instanceof ApiError)) {
    return err instanceof Error && err.message
      ? err.message
      : `${fallbackContext ?? "Request"} failed. Please try again.`;
  }

  const d = err.details;
  switch (err.code) {
    /* ---------------------------------------------------------- money --- */
    case "INSUFFICIENT_FUNDS":
      return "This account does not have enough available balance for that amount plus the fee.";
    case "LIMIT_EXCEEDED": {
      const limit = (d as LimitDetails | null)?.limit ?? asString(d, "limit");
      const spent = (d as LimitDetails | null)?.spent ?? asString(d, "spent");
      if (limit && spent) {
        return `That breaks your limit: ${formatAmountOrDash(limit, null)} allowed, ${formatAmountOrDash(spent, null)} already used in this period.`;
      }
      if (limit) return `That breaks your limit of ${formatAmountOrDash(limit, null)} for this period.`;
      return "That amount exceeds your tier limit. Reduce the amount or request a higher tier.";
    }
    case "INVALID_AMOUNT":
      return asString(d, "field")
        ? `Invalid amount: ${asString(d, "message") ?? "enter a positive number with up to two decimals"}.`
        : "Enter a positive amount with up to two decimals.";
    case "SELF_TRANSFER":
      return "That is your own account — you cannot send money to yourself.";
    case "CURRENCY_MISMATCH":
      return "The recipient has no wallet in this currency. Pick a different account to send from.";
    case "WITHDRAWALS_FROZEN":
      return "Withdrawals are frozen on your profile right now. Deposits and incoming transfers still work.";
    /* ------------------------------------------------------------ pin --- */
    case "PIN_REQUIRED":
      return "Enter your 4-digit PIN to authorise this movement.";
    case "PIN_INVALID": {
      const attempts = (d as AttemptsLeftDetails | null)?.attemptsLeft ?? asNumber(d, "attemptsLeft");
      return typeof attempts === "number"
        ? `That PIN is incorrect. ${attempts} attempt${attempts === 1 ? "" : "s"} left before your PIN is locked.`
        : "That PIN is incorrect.";
    }
    case "PIN_LOCKED": {
      const unlockedAt =
        (d as PinLockedDetails | null)?.unlockedAt ?? asString(d, "unlockedAt");
      return unlockedAt
        ? `Your PIN is locked after repeated failures. You can try again from ${formatDateTime(unlockedAt)}.`
        : "Your PIN is locked after repeated failures. Please try again later.";
    }
    /* ----------------------------------------------------------- auth --- */
    case "AUTH_REQUIRED":
      return "Your session ended. Sign in again to continue.";
    case "TOKEN_EXPIRED":
      return "Your session expired. Sign in again to continue.";
    case "BAD_CREDENTIALS":
      return "That email and password combination is not recognised.";
    case "ACCOUNT_NOT_ACTIVE":
      return "This account is not active, so it cannot be used for money movements. Complete verification to restore access.";
    case "RATE_LIMITED":
      return err.retryAfterSeconds
        ? `Too many attempts. Try again in ${err.retryAfterSeconds} second${err.retryAfterSeconds === 1 ? "" : "s"}.`
        : "Too many attempts in a short time. Wait a moment, then try again.";
    /* --------------------------------------------------------- lookup --- */
    case "USER_NOT_FOUND":
      return "No account exists with that email address. Ask your recipient to register first.";
    case "ACCOUNT_NOT_FOUND":
      return "That wallet account no longer exists. Refresh the page and try again.";
    case "TRANSFER_NOT_FOUND":
      return "No movement exists with that reference. Check the reference and try again.";
    case "ALREADY_ONBOARDED":
      return "This customer has already been onboarded. Sign in instead.";
    case "EMAIL_TAKEN":
      return "That email address is already registered. Sign in instead, or use a different address.";
    /* ----------------------------------------------------- documents --- */
    case "UNSUPPORTED_IMAGE":
      return "That file is not a JPEG or PNG photograph. Take or pick a picture of the document itself.";
    case "FILE_TOO_LARGE":
      return "That image is larger than the 8 MB the review desk accepts. Re-shoot it, or crop it tighter.";
    case "NO_OPEN_SUBMISSION":
      return "There is no submission open for documents right now. Nothing was uploaded.";
    case "DOCUMENTS_INCOMPLETE": {
      const sides = missingSideNames(err.details);
      return sides
        ? `This submission cannot be approved yet: the ${sides} image${sides.includes(",") ? "s are" : " is"} still missing.`
        : "This submission cannot be approved yet: not every required side of the document has been uploaded.";
    }
    case "ACCESS_DENIED":
      return "This account is not on the review desk, so it cannot read or change other customers' records.";
    /* -------------------------------------------------------- general --- */
    case "VALIDATION_FAILED": {
      const fieldError = asString(d, "message") ?? asString(d, "detail");
      return fieldError
        ? `Please correct the form: ${fieldError}`
        : "Please correct the highlighted fields and try again.";
    }
    case "NETWORK_ERROR": {
      if (asString(d, "reason") !== "timeout") {
        return "We could not reach the service. Check your connection — nothing has been moved.";
      }
      // A write that ran out of patience has an unknown result, and saying so is the
      // only honest thing left: the server may commit right after we stop listening.
      return asString(d, "outcome") === "unknown"
        ? "We stopped waiting for an answer, so this may already have gone through. Check your history before you send it again — the same key means a retry cannot pay twice."
        : "The service is taking too long to answer, so it is most likely starting up or asleep. Try again in a moment — nothing has been moved.";
    }
    case "UNEXPECTED_RESPONSE":
      return "The service returned something unexpected, so we stopped. Nothing has been moved.";
    default:
      break;
  }

  if (err.status >= 500) {
    return "The service could not complete this request. Nothing has been moved — please try again shortly.";
  }
  return err.message || `${fallbackContext ?? "Request"} failed (${err.code}).`;
}

/**
 * Some failures arrive in a 200 body rather than a status code — the transfer
 * quote says `allowed: false` with a `reason`. Route them through the same
 * wording so a user sees one voice for one problem.
 */
export function describeCode(
  code: ApiErrorCode,
  details?: Record<string, unknown> | null,
): string {
  return describeError(new ApiError({ status: 200, code, message: "", details: details ?? null }));
}

/** Codes that mean "the money did not move and will not move without a change". */
const RETRY_SAFE_CODES = new Set<ApiErrorCode>([
  "NETWORK_ERROR",
  "RATE_LIMITED",
  "UNEXPECTED_RESPONSE",
  "TOKEN_EXPIRED",
  "AUTH_REQUIRED",
]);

/**
 * True when re-sending the SAME idempotency key is legitimate. For anything else
 * (bad PIN, frozen withdrawals) the user must change something first.
 */
export function isRetrySafeCode(code: ApiErrorCode | null | undefined): boolean {
  return code !== null && code !== undefined && RETRY_SAFE_CODES.has(code);
}

export function parseEnvelope(
  status: number,
  payload: unknown,
  retryAfterSeconds: number | null,
): ApiError {
  const envelope = (payload ?? {}) as Partial<ApiErrorEnvelope>;
  return new ApiError({
    status,
    code: typeof envelope.code === "string" ? envelope.code : "UNEXPECTED_RESPONSE",
    message: typeof envelope.message === "string" ? envelope.message : "",
    details:
      envelope.details && typeof envelope.details === "object"
        ? (envelope.details as Record<string, unknown>)
        : null,
    traceId: typeof envelope.traceId === "string" ? envelope.traceId : null,
    retryAfterSeconds,
  });
}
