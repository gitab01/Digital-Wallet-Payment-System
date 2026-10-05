"use client";

import type { ReactNode } from "react";

import { AuthProvider } from "@/providers/AuthProvider";
import { ToastProvider } from "@/providers/ToastProvider";
import { WalletProvider } from "@/providers/WalletProvider";

/** Client boundary for the whole authenticated app: session, wallet, toasts. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <ToastProvider>
        <WalletProvider>{children}</WalletProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
