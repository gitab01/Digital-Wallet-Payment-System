"use client";

import type { SVGProps } from "react";

/**
 * Minimal 1.5px line icons. No emoji anywhere in this product — decorative
 * glyphs read as a toy in a money context.
 */
const PATHS = {
  wallet: "M3 7.5A2.5 2.5 0 0 1 5.5 5H18a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5.5A2.5 2.5 0 0 1 3 16.5v-9ZM16 12h4",
  send: "M7 17 17 7M9 7h8v8",
  history: "M4 6h16M4 12h16M4 18h10",
  document: "M7 3h7l4 4v14H7V3Zm7 0v5h4M10 13h5m-5 3.5h5",
  settings:
    "M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Zm7.5 2.5-1.9-1.1.3-2.2-2-1.1-1.6 1.5-2-.6-.6 2-2 .6-1.6-1.5-2 1.1.3 2.2L2.5 12l1.9 1.1-.3 2.2 2 1.1 1.6-1.5 2 .6.6-2 2-.6 1.6 1.5 2-1.1-.3-2.2L19.5 12Z",
  refresh: "M20 12a8 8 0 1 1-2.34-5.66M20 4v4h-4",
  arrowUpRight: "M7 17 17 7M9 7h8v8",
  arrowDownLeft: "M17 7 7 17M15 17H7V9",
  check: "M4 12.5 9 17.5 20 6.5",
  alert: "M12 8v5m0 3.5v.5M10.3 4.2 2.9 17.4A2 2 0 0 0 4.6 20.4h14.8a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z",
  chevronLeft: "M14.5 5.5 8 12l6.5 6.5",
  chevronRight: "M9.5 5.5 16 12l-6.5 6.5",
  shield: "M12 3.5 5 6v5.5c0 4.2 2.9 7.4 7 9 4.1-1.6 7-4.8 7-9V6l-7-2.5Z",
  plus: "M12 5v14M5 12h14",
  close: "M6 6l12 12M18 6 6 18",
  download: "M12 4v11m0 0 4-4m-4 4-4-4M4 19h16",
  clock: "M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17ZM12 7.5V12l3 2",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0",
  logout: "M15 5H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h8M17 15l3-3-3-3M20 12h-9",
  camera:
    "M3 9a1.5 1.5 0 0 1 1.5-1.5h2.9L9 5h6l1.6 2.5h2.9A1.5 1.5 0 0 1 21 9v8.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5V9Zm9 5.8a3.3 3.3 0 1 0 0-6.6 3.3 3.3 0 0 0 0 6.6Z",
  search: "M11 4.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM20 20l-4.4-4.4",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  className = "h-5 w-5",
  strokeWidth = 1.5,
  ...rest
}: { name: IconName; className?: string; strokeWidth?: number } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
