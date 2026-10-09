"use client";

import type { ReactNode } from "react";

import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";

/**
 * The one thing this product does that a normal form does not show: a movement is
 * written twice, once out and once in, and the two sides have to agree. That excerpt is
 * the subject of the page, so it is what fills the space beside the form rather than a
 * photograph or a slogan. Hidden below `lg`, where the form is the only thing that fits.
 */
function LedgerExcerpt() {
  return (
    <section className="w-full max-w-md">
      <h2 className="text-h2 font-semibold tracking-tight">Money that shows its working.</h2>
      <p className="mt-3 max-w-sm text-body leading-6 text-ink-muted">
        Every movement is written twice — out of one wallet, into another — so a balance is a
        figure the ledger agrees with, not a number someone typed in.
      </p>

      <div className="mt-8 border-t border-line">
        <div className="flex items-baseline justify-between gap-4 py-3">
          <span className="num font-mono text-label text-ink">WLT-8Q2K4MDP</span>
          <span className="num text-label text-ink-faint">07 Oct 22:35 UTC</span>
        </div>

        {[
          { leg: "Dr", account: "ETB wallet · Hanna G", amount: "−1,250.43" },
          { leg: "Cr", account: "ETB wallet · Dawit B", amount: "+1,250.00" },
          { leg: "Cr", account: "Fee income", amount: "+0.43" },
        ].map((row) => (
          <div
            key={row.account}
            className="flex items-baseline gap-4 border-t border-line py-3 text-body"
          >
            <span className="w-6 shrink-0 font-mono text-label uppercase text-ink-faint">
              {row.leg}
            </span>
            <span className="min-w-0 flex-1 truncate text-ink-muted">{row.account}</span>
            <span className="num shrink-0 tabular-nums text-ink">{row.amount}</span>
          </div>
        ))}

        <div className="flex items-baseline justify-between gap-4 border-t border-ink py-3">
          <span className="text-label font-medium uppercase tracking-wide text-ink-faint">
            1,250.00 sent · 0.43 fee
          </span>
          <span className="text-label font-medium uppercase tracking-wide text-accent">
            Balanced
          </span>
        </div>
      </div>
    </section>
  );
}

/**
 * Unauthenticated frame. Phone and tablet: one column, nothing but the form. Desktop:
 * the form sits in a right-hand column with the ledger excerpt holding the left.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <header className="border-b border-line px-4 py-4 sm:px-6 lg:px-10">
        <Link href="/" className="inline-flex items-center gap-2.5" aria-label="Mela Wallet home">
          <BrandMark className="h-6 w-6 text-ink" />
          <span className="text-label font-semibold uppercase leading-none tracking-[0.14em] text-ink">
            Mela&nbsp;Wallet
          </span>
        </Link>
      </header>

      <div className="mx-auto flex w-full max-w-content flex-1 flex-col gap-12 px-4 py-8 sm:px-6 sm:py-12 lg:grid lg:grid-cols-2 lg:items-center lg:gap-16 lg:px-10 lg:py-16">
        <div className="hidden lg:flex lg:justify-start">
          <LedgerExcerpt />
        </div>
        <main className="w-full max-w-xl lg:mx-auto lg:max-w-md">{children}</main>
      </div>

      <footer className="border-t border-line px-4 py-4 text-center text-label text-ink-faint sm:px-6 lg:px-10">
        Money is stored and moved as exact two-decimal values. Balances only change after the
        server confirms.
      </footer>
    </div>
  );
}
