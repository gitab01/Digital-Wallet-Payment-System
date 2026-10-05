"use client";

import type { ChangeEvent, ReactNode } from "react";
import { useId } from "react";

export interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "email" | "password" | "tel" | "date" | "numeric";
  placeholder?: string;
  error?: string | null;
  hint?: ReactNode;
  required?: boolean;
  autoComplete?: string;
  inputMode?: "text" | "email" | "tel" | "numeric" | "decimal";
  maxLength?: number;
  disabled?: boolean;
  name?: string;
  /** e.g. `text` + uppercase for ISO country codes. */
  transform?: (value: string) => string;
}

const TYPE_MAP: Record<NonNullable<FieldProps["type"]>, string> = {
  text: "text",
  email: "email",
  password: "password",
  tel: "tel",
  date: "date",
  numeric: "text",
};

export function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  error,
  hint,
  required,
  autoComplete,
  inputMode,
  maxLength,
  disabled,
  name,
  transform,
}: FieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="label">
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      <input
        id={id}
        name={name ?? id}
        type={TYPE_MAP[type]}
        value={value}
        disabled={disabled}
        required={required}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={inputMode}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          onChange(transform ? transform(event.target.value) : event.target.value)
        }
        className={`input ${error ? "input-invalid" : ""}`}
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

export interface SelectFieldProps {
  label: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string) => void;
  error?: string | null;
  hint?: ReactNode;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

export function SelectField({
  label,
  value,
  options,
  onChange,
  error,
  hint,
  required,
  disabled,
  placeholder,
}: SelectFieldProps) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="label">
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      <select
        id={id}
        value={value}
        required={required}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        onChange={(event) => onChange(event.target.value)}
        className={`input ${error ? "input-invalid" : ""}`}
      >
        {placeholder ? (
          <option value="" disabled>
            {placeholder}
          </option>
        ) : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? (
        <p className="text-label leading-4 text-debit">{error}</p>
      ) : hint ? (
        <p className="text-label leading-4 text-ink-faint">{hint}</p>
      ) : null}
    </div>
  );
}

/** Read-only row: label left, value right. Used for summaries everywhere. */
export function SummaryRow({
  label,
  value,
  tone = "neutral",
  mono,
}: {
  label: string;
  value: ReactNode;
  tone?: "neutral" | "positive" | "negative";
  mono?: boolean;
}) {
  const toneClass =
    tone === "positive" ? "text-accent" : tone === "negative" ? "text-debit" : "text-ink";
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-3 last:border-b-0">
      <dt className="shrink-0 text-label font-medium uppercase tracking-wide text-ink-faint">
        {label}
      </dt>
      <dd className={`text-right text-body ${mono ? "font-mono text-[0.8125rem]" : "num"} ${toneClass}`}>
        {value}
      </dd>
    </div>
  );
}
