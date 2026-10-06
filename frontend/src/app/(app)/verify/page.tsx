"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { getKyc, uploadKycDocument } from "@/lib/api";
import { describeError } from "@/lib/errors";
import { missingSidesFor, openSubmission } from "@/lib/kyc";
import { formatDateTime } from "@/lib/money";
import { useDocumentTitle } from "@/lib/useDocumentTitle";
import {
  documentTypeLabel,
  requiredSidesFor,
  type DocumentSide,
  type KycView,
} from "@/lib/types";
import { validateImageFile } from "@/lib/validation";
import { useToast } from "@/providers/ToastProvider";
import { DocumentImageView } from "@/components/DocumentImage";
import { DocumentPhotoField } from "@/components/DocumentPhotoField";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Chip } from "@/components/ui/Chip";
import { SummaryRow } from "@/components/ui/Field";
import { EmptyState, Panel, Skeleton } from "@/components/ui/Panel";

const SIDE_LABEL: Record<DocumentSide, string> = {
  FRONT: "Front",
  BACK: "Back",
};

/**
 * The state of a submission the customer can still fix: what is on file, which
 * required side is missing, and a picker for each one. Also the landing page when
 * signup created the account but an image did not reach the service.
 */
function VerifyContent() {
  useDocumentTitle("Verify identity");
  const [view, setView] = useState<KycView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    getKyc()
      .then((result) => {
        setView(result);
        setError(null);
      })
      .catch((err: unknown) => setError(describeError(err, "Verification")))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const open = openSubmission(view);
  const missing = missingSidesFor(open);

  return (
    <>
      <PageHeader
        title="Verify your identity"
        description="Every required side of your document has to be photographed before the review desk can approve it. Until then your tier and limits stay as they are."
        actions={
          <Button size="sm" variant="secondary" onClick={load} disabled={loading}>
            Reload
          </Button>
        }
      />

      <div className="space-y-5">
        <HandoffNotice />

        {error ? (
          <Callout tone="error" title="We could not read your submission">
            {error}
          </Callout>
        ) : null}

        {loading && !view ? (
          <div className="space-y-4">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : null}

        {!loading && view && !open ? (
          <NoOpenSubmission view={view} />
        ) : null}

        {open ? (
          <>
            <Panel title="This submission">
              <dl>
                <SummaryRow label="Document" value={documentTypeLabel(open.documentType)} />
                <SummaryRow label="Number ends" value={`•••• ${open.last4}`} mono />
                <SummaryRow label="Tier applied for" value={`Tier ${open.tier}`} />
                <SummaryRow label="Submitted" value={formatDateTime(open.submittedAt)} />
                <SummaryRow
                  label="Status"
                  value={<Chip tone={statusTone(open.status)}>{open.status}</Chip>}
                />
              </dl>
            </Panel>

            {missing.length > 0 ? (
              <Callout tone="pending" title="Not ready for approval yet">
                Missing {missing.map((side) => SIDE_LABEL[side].toLowerCase()).join(" and ")} image
                {missing.length > 1 ? "s" : ""}. The desk cannot approve this submission until every
                side is on file.
              </Callout>
            ) : (
              <Callout tone="success" title="All required sides are on file">
                Nothing more is needed from you. The review desk will decide it, and your limits change
                when it does.
              </Callout>
            )}

            <Panel
              title="Document images"
              description="Uploading a side that already exists replaces it. Each image is re-encoded as a JPEG before it is stored, which strips the camera's location data."
            >
              <div className="grid gap-6 sm:grid-cols-2">
                {requiredSidesFor(open.documentType).map((side) => {
                  const storedId = open.sides?.[side] ?? null;
                  return (
                    <SideRow
                      key={side}
                      side={side}
                      documentType={open.documentType}
                      storedId={storedId}
                      onUploaded={load}
                    />
                  );
                })}
              </div>
            </Panel>
          </>
        ) : null}
      </div>
    </>
  );
}

/* `useSearchParams` needs a boundary, since the hand-off banner reads the query. */
export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      }
    >
      <VerifyContent />
    </Suspense>
  );
}

function statusTone(status: string): "positive" | "negative" | "muted" {
  if (status === "APPROVED") return "positive";
  if (status === "REJECTED") return "negative";
  return "muted";
}

/** One side: what is stored already, and the picker that replaces or supplies it. */
function SideRow({
  side,
  documentType,
  storedId,
  onUploaded,
}: {
  side: DocumentSide;
  documentType: string;
  storedId: number | null;
  onUploaded: () => void;
}) {
  const { push } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const label = `${SIDE_LABEL[side]} of your ${documentTypeLabel(documentType)}`;

  const upload = async () => {
    const invalid = validateImageFile(file, label);
    if (invalid) {
      setError(invalid);
      return;
    }
    if (!file) return;

    setBusy(true);
    setError(null);
    try {
      await uploadKycDocument(side, file);
      setFile(null);
      push({
        tone: "success",
        title: `${SIDE_LABEL[side]} image saved`,
        body: storedId ? "The review desk sees the replacement." : "It is attached to your submission.",
      });
      onUploaded();
    } catch (err: unknown) {
      setError(describeError(err, "Upload"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 border-t border-line pt-4 first:border-t-0 first:pt-0 sm:border-t-0 sm:pt-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="section-title">{label}</p>
        {storedId ? (
          <Chip tone="positive">
            <span className="num">#{storedId}</span> on file
          </Chip>
        ) : (
          <Chip tone="negative">Missing</Chip>
        )}
      </div>

      {storedId ? (
        <DocumentImageView
          documentId={storedId}
          alt={`${label} as stored`}
          summary="This is the copy the review desk reads. Your own reads are recorded in the audit trail."
        />
      ) : null}

      <DocumentPhotoField
        label={storedId ? `Replacement ${SIDE_LABEL[side].toLowerCase()}` : `${SIDE_LABEL[side]} photo`}
        file={file}
        error={error}
        busy={busy}
        disabled={busy}
        emptyHint={
          storedId ? "Choose a newer photo to replace the one on file." : "Not photographed yet."
        }
        onPick={(picked) => {
          setError(null);
          setFile(picked);
        }}
        onClear={() => setFile(null)}
      />

      <Button block onClick={() => void upload()} disabled={!file || busy} loading={busy}>
        {storedId ? "Replace image" : "Upload image"}
      </Button>
    </div>
  );
}

/** Where an incomplete submission went wrong, and what is not fixable here. */
function NoOpenSubmission({ view }: { view: KycView }) {
  if (view.status === "APPROVED") {
    return (
      <Panel title="Verification complete">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone="positive">
              Tier {view.tier} approved
            </Chip>
            <span className="text-label uppercase tracking-wide text-ink-faint">
              Reviewed {formatDateTime(view.reviewedAt)}
            </span>
          </div>
          <p className="text-body leading-6 text-ink-muted">
            Nothing is outstanding on this account. A higher tier is requested with another document
            from Settings, and its images are uploaded here once it is submitted.
          </p>
          <Link href="/settings">
            <Button size="sm" variant="secondary">
              Tier and limits
            </Button>
          </Link>
        </div>
      </Panel>
    );
  }

  return (
    <EmptyState
      title={view.status === "REJECTED" ? "Submission rejected" : "No submission open"}
      body={
        view.status === "REJECTED"
          ? "The review desk rejected this submission, so images can no longer be attached to it. A new one has to be filed with fresh documents before anything can be approved."
          : "There is no submission for documents right now. File one with your document details and the images can be added here."
      }
      action={
        <Link href="/settings">
          <Button size="sm" variant="secondary">
            Submit a document
          </Button>
        </Link>
      }
    />
  );
}

/**
 * Signup creates the account before the images are posted, so a failed upload
 * lands here with the session intact. The reason is a query flag; what is missing
 * is re-read from `GET /api/kyc` rather than trusted from the URL.
 */
function HandoffNotice() {
  const params = useSearchParams();
  if (params.get("reason") !== "upload") return null;
  return (
    <Callout tone="error" title="Your account exists, but an image did not arrive">
      Registration finished and you are signed in — the document upload step did not. Nothing was lost:
      add the missing sides below and the submission goes to the review desk as normal.
    </Callout>
  );
}

