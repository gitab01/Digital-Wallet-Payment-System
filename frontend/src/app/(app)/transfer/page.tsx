"use client";

import { Suspense } from "react";

import { TransferWizard } from "@/components/transfer/TransferWizard";
import { Skeleton } from "@/components/ui/Panel";

/**
 * The wizard reads `?currency=` from the wallet cards, so it needs a Suspense
 * boundary for the search params during static generation.
 */
export default function TransferPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-5">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      }
    >
      <TransferWizard />
    </Suspense>
  );
}
