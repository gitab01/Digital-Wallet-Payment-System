"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { getKyc } from "@/lib/api";
import { missingSidesFor, openSubmission } from "@/lib/kyc";
import { type DocumentSide, type KycView } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";

const SIDE_WORD: Record<DocumentSide, string> = {
  FRONT: "front",
  BACK: "back",
};

/**
 * A SUBMITTED submission with a required side still missing is not "pending" — it
 * is stuck, and the customer is the only one who can unstick it. The wallet says so
 * rather than leaving the queue to wait silently.
 *
 * Read-only and self-contained: if `GET /api/kyc` fails this renders nothing,
 * because a missing banner is a far better failure than a false alarm on a money
 * screen.
 */
export function KycIncompleteNotice() {
  const [missing, setMissing] = useState<DocumentSide[]>([]);

  useEffect(() => {
    let cancelled = false;
    getKyc()
      .then((view: KycView) => {
        if (cancelled) return;
        setMissing(missingSidesFor(openSubmission(view)));
      })
      .catch(() => {
        /* the /verify screen carries the real error when it is opened */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (missing.length === 0) return null;

  const sides = missing.map((side) => SIDE_WORD[side]).join(" and ");

  return (
    <Callout
      tone="pending"
      title="Verification is incomplete"
      action={
        <Link href="/verify">
          <Button size="sm" variant="secondary">
            Add the {sides}
          </Button>
        </Link>
      }
    >
      Your submission is with the review desk but the {sides} image of your document has not arrived,
      so it cannot be approved and your limits stay where they are.
    </Callout>
  );
}
