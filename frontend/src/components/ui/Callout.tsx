"use client";

import type { ReactNode } from "react";

type Tone = "error" | "info" | "pending" | "success";

const BORDER: Record<Tone, string> = {
  error: "border-l-debit",
  info: "border-l-ink",
  pending: "border-l-ink-faint",
  success: "border-l-accent",
};

const TEXT: Record<Tone, string> = {
  error: "text-debit",
  info: "text-ink",
  pending: "text-ink-muted",
  success: "text-accent",
};

/**
 * Status copy is always specific: the tone carries severity, the body carries the
 * machine code's translation (see lib/errors.ts).
 */
export function Callout({
  tone = "info",
  title,
  children,
  action,
  code,
}: {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
  code?: string;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "pending" ? "polite" : undefined}
      className={`rounded-md border border-line border-l-2 ${BORDER[tone]} px-4 py-3`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {title ? (
            <p className={`text-body font-semibold ${TEXT[tone]}`}>{title}</p>
          ) : null}
          {children ? (
            <div className={`space-y-1 text-label leading-5 ${title ? "mt-1" : ""} ${TEXT[tone]}`}>
              {children}
            </div>
          ) : null}
          {code ? (
            <p className="mt-2 font-mono text-label uppercase tracking-wide text-ink-faint">
              {code}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}
