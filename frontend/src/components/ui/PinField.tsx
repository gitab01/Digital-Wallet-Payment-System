"use client";

import { useId } from "react";

/**
 * 4-digit authorisation input. Masked, digits-only, and hard-capped at 4 — the
 * contract says exactly 4 digits, so an over-long value can never reach the API.
 */
export function PinField({
  label = "PIN",
  value,
  onChange,
  error,
  hint,
  disabled,
  autoFocus,
  autoComplete = "one-time-code",
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  hint?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  autoComplete?: string;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="label">
        {label} <span aria-hidden="true">*</span>
      </label>
      <input
        id={id}
        type="password"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete={autoComplete}
        value={value}
        disabled={disabled}
        autoFocus={autoFocus}
        maxLength={4}
        placeholder="••••"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        onChange={(event) => {
          const digits = event.target.value.replace(/\D/g, "").slice(0, 4);
          onChange(digits);
        }}
        className={`input num max-w-[10rem] text-center text-h2 tracking-[0.4em] ${error ? "input-invalid" : ""}`}
      />
      {error ? (
        <p id={`${id}-error`} className="text-label leading-4 text-debit">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-label leading-4 text-ink-faint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
