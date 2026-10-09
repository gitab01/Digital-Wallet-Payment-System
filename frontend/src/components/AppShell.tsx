"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { useAuth } from "@/providers/AuthProvider";
import { useWallet } from "@/providers/WalletProvider";
import { ConnectionBadge } from "@/components/ConnectionBadge";
import { BrandMark } from "@/components/BrandMark";
import { ReauthDialog } from "@/components/ReauthDialog";
import { Icon, type IconName } from "@/components/ui/Icon";

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  /** Six destinations share one phone tab bar, so the reviewer's gets a short word. */
  mobileLabel?: string;
}

const CUSTOMER_NAV: NavItem[] = [
  { href: "/", label: "Wallet", icon: "wallet" },
  { href: "/transfer", label: "Transfer", icon: "send" },
  { href: "/history", label: "History", icon: "history" },
  { href: "/statement", label: "Statement", icon: "document" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

const REVIEW_NAV: NavItem[] = [
  { href: "/admin", label: "Operations", mobileLabel: "Review", icon: "shield" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      className="group inline-flex items-center gap-2.5"
      aria-label="Mela Wallet home"
    >
      <BrandMark className={`shrink-0 text-ink ${compact ? "h-6 w-6" : "h-7 w-7"}`} />
      <span
        className={`font-semibold uppercase leading-none tracking-[0.14em] text-ink ${compact ? "text-label" : "text-[0.8125rem]"}`}
      >
        Mela&nbsp;Wallet
      </span>
    </Link>
  );
}

/**
 * Sidebar on tablet-and-up, top bar plus bottom tabs on phones. Five destinations
 * fit 390px without a hamburger, so there is no hidden navigation on mobile; the
 * sixth appears for reviewers only, and still fits.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { email, signOut, isReviewer } = useAuth();
  const { data } = useWallet();

  const nav = isReviewer ? [...CUSTOMER_NAV, ...REVIEW_NAV] : CUSTOMER_NAV;

  return (
    <div className="min-h-dvh bg-white">
      {/* Phone / small-tablet header */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-white px-4 py-3 lg:hidden">
        <Brand compact />
        <div className="flex items-center gap-3">
          <ConnectionBadge compact />
          {data ? (
            <span className="chip border-line text-ink-muted">Tier {data.tier}</span>
          ) : null}
        </div>
      </header>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-white lg:flex">
        <div className="border-b border-line px-6 py-5">
          <Brand />
        </div>
        <nav className="flex-1 px-3 py-5" aria-label="Primary">
          <ul className="space-y-1">
            {nav.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-body transition-colors ${
                      active
                        ? "border border-ink font-semibold text-ink"
                        : "border border-transparent text-ink-muted hover:border-line hover:text-ink"
                    }`}
                  >
                    <Icon name={item.icon} className="h-4 w-4" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="border-t border-line px-6 py-4">
          <ConnectionBadge />
          <p className="mt-3 truncate text-label text-ink-faint" title={email ?? undefined}>
            {email ?? "—"}
          </p>
          <button
            type="button"
            onClick={() => void signOut()}
            className="mt-2 inline-flex items-center gap-2 text-label font-medium uppercase tracking-wide text-ink-muted hover:text-ink"
          >
            <Icon name="logout" className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      <div className="lg:pl-60">
        <main className="mx-auto w-full max-w-content px-4 pb-28 pt-5 sm:px-6 sm:pt-8 lg:px-10 lg:pb-14">
          {children}
        </main>
      </div>

      {/* Phone tab bar */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        {/*
          Both class strings are written out literally because the scanner only keeps
          what appears in source: 320px split five ways leaves 64px per destination and
          six leaves 53px, so the reviewer's extra tab costs a point of type. The labels
          are sentence-case like the sidebar's, not uppercase -- a capital S is a pixel
          wider than a small one, and STATEMENT is the word that decides the tab type.
        */}
        <ul className={isReviewer ? "grid grid-cols-6" : "grid grid-cols-5"}>
          {nav.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex flex-col items-center gap-1 px-0.5 py-2.5 text-center ${
                    isReviewer ? "text-[0.625rem]" : "text-label"
                  } leading-3 ${active ? "font-semibold text-ink" : "text-ink-faint"}`}
                >
                  {active ? (
                    <span aria-hidden="true" className="absolute inset-x-4 top-0 h-0.5 bg-ink" />
                  ) : null}
                  <Icon name={item.icon} className="h-5 w-5" />
                  <span className="w-full truncate">{item.mobileLabel ?? item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <ReauthDialog />
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 border-b border-line pb-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        {description ? (
          <p className="mt-1.5 max-w-xl text-label leading-5 text-ink-faint">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
