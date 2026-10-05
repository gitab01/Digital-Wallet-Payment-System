"use client";

import { useState, type ReactNode } from "react";

export function CopyButton({
  value,
  label = "Copy",
  className = "",
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(value);
      ok = true;
    } catch {
      try {
        const area = document.createElement("textarea");
        area.value = value;
        area.setAttribute("readonly", "true");
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        ok = document.execCommand("copy");
        area.remove();
      } catch {
        ok = false;
      }
    }
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <button
      type="button"
      onClick={copy}
      className={`rounded border border-line px-2 py-1 text-label font-medium uppercase tracking-wide text-ink-muted hover:border-ink hover:text-ink ${className}`.trim()}
    >
      {copied ? "Copied" : label}
    </button>
  );
}

/** Monospace identifier: references, idempotency keys, ledger entry ids. */
export function Mono({
  children,
  className = "",
  tag = "span",
}: {
  children: ReactNode;
  className?: string;
  tag?: "span" | "div" | "li";
}) {
  const Element = tag;
  return <Element className={`font-mono text-[0.8125rem] leading-5 break-all ${className}`.trim()}>{children}</Element>;
}
