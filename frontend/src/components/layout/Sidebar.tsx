"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Wallet,
  SendHorizontal,
  ListOrdered,
  UserCircle,
  LogOut,
  Menu,
  X,
  Zap,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard",    label: "Dashboard",    icon: LayoutDashboard, badge: null },
  { href: "/wallet",       label: "Wallets",       icon: Wallet,          badge: null },
  { href: "/transfer",     label: "Transfer",      icon: SendHorizontal,  badge: null },
  { href: "/transactions", label: "Transactions",  icon: ListOrdered,     badge: null },
  { href: "/profile",      label: "Profile",       icon: UserCircle,      badge: null },
];

function NavContent({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();
  const { logout, user } = useAuth();

  return (
    <div className="flex h-full flex-col bg-surface-900 text-white">
      {/* ── Brand ── */}
      <div className="flex items-center gap-3 px-5 py-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-brand shadow-glow-sm">
          <Zap className="h-5 w-5 text-white" strokeWidth={2.5} />
        </div>
        <div>
          <p className="text-[15px] font-bold tracking-tight">PayVault</p>
          <p className="text-[10px] font-medium text-white/40 uppercase tracking-widest">
            Digital Wallet
          </p>
        </div>
      </div>

      {/* ── Divider ── */}
      <div className="mx-5 h-px bg-white/[.07]" />

      {/* ── Navigation ── */}
      <nav className="flex-1 space-y-0.5 px-3 py-4">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={cn(
                "group relative flex items-center gap-3 rounded-xl px-3 py-2.5",
                "text-sm font-medium transition-all duration-150",
                active
                  ? "bg-white/[.10] text-white"
                  : "text-white/50 hover:bg-white/[.06] hover:text-white/90"
              )}
            >
              {/* Active bar */}
              {active && (
                <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand-400" />
              )}

              <Icon
                className={cn(
                  "h-[18px] w-[18px] shrink-0 transition-colors",
                  active ? "text-brand-400" : "text-white/40 group-hover:text-white/60"
                )}
                strokeWidth={active ? 2.2 : 1.8}
              />
              <span className="flex-1">{label}</span>

              {active && (
                <ChevronRight className="h-3.5 w-3.5 text-white/25" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* ── Divider ── */}
      <div className="mx-5 h-px bg-white/[.07]" />

      {/* ── User section ── */}
      <div className="p-3">
        {/* Avatar row */}
        <div className="mb-1 flex items-center gap-3 rounded-xl px-3 py-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-brand text-xs font-bold text-white shadow-glow-sm">
            {user?.firstName?.[0]}
            {user?.lastName?.[0]}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-white">
              {user?.firstName} {user?.lastName}
            </p>
            <p className="truncate text-[11px] text-white/40">{user?.email}</p>
          </div>
        </div>

        {/* Logout */}
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white/40 transition-all hover:bg-red-500/10 hover:text-red-400"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </div>
  );
}

export function Sidebar() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* ── Desktop ── */}
      <aside
        className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:flex lg:w-[260px] lg:flex-col"
        style={{ width: "var(--sidebar-w, 260px)" }}
      >
        <NavContent />
      </aside>

      {/* ── Mobile top bar ── */}
      <header className="sticky top-0 z-40 flex items-center gap-4 border-b border-surface-100 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
        <button
          onClick={() => setOpen(true)}
          className="btn-icon"
          aria-label="Open menu"
        >
          <Menu className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-brand">
            <Zap className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-[15px] font-bold text-surface-900">PayVault</span>
        </div>
      </header>

      {/* ── Mobile drawer ── */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden animate-fade-in">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          {/* Panel */}
          <aside className="absolute inset-y-0 left-0 w-72 animate-slide-up shadow-card-lg">
            <button
              onClick={() => setOpen(false)}
              className="absolute right-4 top-5 z-10 rounded-lg p-1 text-white/40 hover:text-white/80"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
            <NavContent onClose={() => setOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
}
