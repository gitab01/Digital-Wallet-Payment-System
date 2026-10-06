"use client";

import type { ReactNode } from "react";
import Link from "next/link";

import { useAuth } from "@/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Panel, Skeleton } from "@/components/ui/Panel";
import { Icon } from "@/components/ui/Icon";

/**
 * The console is offered on the strength of the JWT `roles` claim, which decides
 * only what this client shows: every `/api/admin` route answers 403 again for an
 * account that is not on the review desk. A customer who types the URL gets a real
 * screen that says why nothing is on it — never a blank page, never a stack of
 * permission toasts from half a dozen parallel requests.
 */
export function RequireReviewer({ children }: { children: ReactNode }) {
  const { status, isReviewer } = useAuth();

  if (status === "loading") {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isReviewer) return <>{children}</>;

  return <NotAReviewer />;
}

function NotAReviewer() {
  return (
    <div className="space-y-5">
      <div className="mb-6 border-b border-line pb-4">
        <h1 className="page-title">Operations console</h1>
        <p className="mt-1.5 max-w-xl text-label leading-5 text-ink-faint">
          Review desk, customer records and ledger proofs.
        </p>
      </div>

      <Panel>
        <div className="flex flex-col items-start gap-4">
          <span className="flex h-9 w-9 items-center justify-center rounded border border-line text-ink-muted">
            <Icon name="shield" className="h-5 w-5" />
          </span>
          <div className="space-y-2">
            <p className="section-title">This area is for the review desk</p>
            <p className="text-body leading-6 text-ink-muted">
              Nothing was loaded and nothing was changed. Reading another customer&rsquo;s identity
              documents, balances and audit trail needs the reviewer role on your account, which the
              service grants from its own list — it is not something this screen can give you.
            </p>
            <p className="text-label leading-5 text-ink-faint">
              If you expected to be here, sign in with the reviewer account, or ask the operations
              owner to add your e-mail to it.
            </p>
          </div>
          <Link href="/">
            <Button size="sm" variant="secondary">
              <Icon name="chevronLeft" className="h-4 w-4" />
              Back to wallet
            </Button>
          </Link>
        </div>
      </Panel>
    </div>
  );
}
