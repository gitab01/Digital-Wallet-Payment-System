"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/providers/AuthProvider";
import { Spinner } from "@/components/ui/Button";

/**
 * Guard for every screen behind a session. The target is preserved so a session
 * that expires mid-wizard returns the user to the same place after signing in.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  if (status === "loading") {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-3 text-ink-faint">
        <Spinner />
        <span className="text-label uppercase tracking-wide">Restoring session</span>
      </div>
    );
  }

  if (status !== "authenticated") return null;
  return <>{children}</>;
}
