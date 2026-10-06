"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin", label: "Review desk", exact: true },
  { href: "/admin/clients", label: "Clients", exact: false },
  { href: "/admin/health", label: "Ledger and audit", exact: false },
];

/**
 * Where the shell's one Operations entry is the door, this is the room: three
 * destinations the sidebar should not grow. Scrolls sideways on a phone rather
 * than shrinking the labels, and never wraps into a second row.
 */
export function AdminTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Operations"
      className="no-scrollbar -mx-4 mb-5 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0"
    >
      <ul className="flex min-w-max items-center gap-1">
        {TABS.map((tab) => {
          const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`block border-b-2 px-3 py-2.5 text-label font-medium uppercase tracking-wide ${
                  active ? "border-ink text-ink" : "border-transparent text-ink-faint hover:text-ink"
                }`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
