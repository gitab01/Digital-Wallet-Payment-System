import { AMOUNT_INPUT_RE } from "./money";

/**
 * Client-side gates that mirror the contract's validation rules. These exist to
 * save a round trip, not to replace server validation — every form still surfaces
 * the server's own `VALIDATION_FAILED` message.
 */

export type FieldErrors<T extends string> = Partial<Record<T, string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;
const PIN_RE = /^\d{4}$/;
const PHONE_RE = /^\+\d{7,15}$/;
const COUNTRY_RE = /^[A-Z]{2}$/;
const DOC_RE = /^[A-Za-z0-9-]{4,20}$/;

export function validateEmail(value: string): string | null {
  const v = value.trim();
  if (!v) return "Enter an email address.";
  if (!EMAIL_RE.test(v)) return "That is not a valid email address.";
  return null;
}

export function validatePin(value: string, label = "PIN"): string | null {
  if (!value) return `Enter your 4-digit ${label}.`;
  if (!PIN_RE.test(value)) return `${label} must be exactly 4 digits.`;
  return null;
}

export function validateRequired(value: string, label: string): string | null {
  return value.trim() ? null : `${label} is required.`;
}

export function validateFullName(value: string): string | null {
  const v = value.trim();
  if (!v) return "Enter your full name.";
  if (v.length < 3) return "That name looks too short.";
  return null;
}

export function validatePassword(value: string): string | null {
  if (!value) return "Enter a password.";
  if (value.length < 8) return "Use at least 8 characters.";
  return null;
}

export function validatePhone(value: string): string | null {
  const v = value.trim();
  if (!v) return "Enter your phone number in international format, e.g. +251900000000.";
  if (!PHONE_RE.test(v)) return "Use international format, starting with +.";
  return null;
}

export function validateDateOfBirth(value: string): string | null {
  if (!value) return "Enter your date of birth.";
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return "That date is not valid.";
  if (parsed.getTime() > Date.now()) return "Date of birth cannot be in the future.";
  const ageMs = Date.now() - parsed.getTime();
  if (ageMs < 18 * 365.25 * 24 * 3600 * 1000) return "You must be at least 18 to onboard.";
  return null;
}

export function validateCountry(value: string): string | null {
  const v = value.trim().toUpperCase();
  if (!v) return "Enter your country as a 2-letter code, e.g. ET.";
  if (!COUNTRY_RE.test(v)) return "Use a 2-letter ISO country code, e.g. ET.";
  return null;
}

export function validateDocumentNumber(value: string): string | null {
  const v = value.trim();
  if (!v) return "Enter your document number.";
  if (!DOC_RE.test(v)) return "Use 4-20 letters, digits or hyphens.";
  return null;
}

/** Mid-edit amount check (does not force the trailing decimals). */
export function validateAmountInput(value: string): string | null {
  const v = value.trim();
  if (!v) return "Enter an amount.";
  if (!AMOUNT_INPUT_RE.test(v)) return "Numbers only, with up to two decimals.";
  if (/^0+\.?0*$/.test(v)) return "The amount must be greater than zero.";
  return null;
}

export function validateDateRange(from: string, to: string): { from?: string; to?: string } {
  const errors: { from?: string; to?: string } = {};
  if (from && Number.isNaN(new Date(from).getTime())) errors.from = "Not a valid date.";
  if (to && Number.isNaN(new Date(to).getTime())) errors.to = "Not a valid date.";
  if (from && to && from > to) errors.to = "The end date is before the start date.";
  return errors;
}

export function hasErrors(errors: FieldErrors<string>): boolean {
  return Object.values(errors).some((value) => Boolean(value));
}
