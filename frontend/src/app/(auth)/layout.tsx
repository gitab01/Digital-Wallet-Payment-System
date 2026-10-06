"use client";

import type { ReactNode } from "react";

import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";

/** Unauthenticated frame: one column, generous space, nothing but the form. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <header className="border-b border-line px-4 py-4 sm:px-6">
        <Link href="/" className="inline-flex items-center gap-2.5" aria-label="Mela Wallet home">
          <BrandMark className="h-6 w-6 text-ink" />
          <span className="text-label font-semibold uppercase leading-none tracking-[0.14em] text-ink">
            Mela&nbsp;Wallet
          </span>
        </Link>
      </header>
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-8 sm:px-6 sm:py-14">{children}</main>
      <footer className="border-t border-line px-4 py-4 text-center text-label text-ink-faint sm:px-6">
        Money is stored and moved as exact two-decimal values. Balances only change after the
        server confirms.
      </footer>
    </div>
  );
}
