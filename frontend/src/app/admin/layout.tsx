"use client";

import type { ReactNode } from "react";

import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { RequireReviewer } from "@/components/admin/RequireReviewer";

/**
 * The console needs a session and the reviewer role, in that order: RequireAuth
 * sends a signed-out visitor to the login page, RequireReviewer tells a signed-in
 * customer the truth about why the screen is empty.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <AppShell>
        <RequireReviewer>
          <AdminTabs />
          {children}
        </RequireReviewer>
      </AppShell>
    </RequireAuth>
  );
}
