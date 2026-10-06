"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";

import { AbortedError, getKycDocumentImage } from "@/lib/api";
import { describeError } from "@/lib/errors";
import { Button, Spinner } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Panel";

/**
 * `GET /api/kyc/documents/{id}/image` needs the Authorization header, so a plain
 * `<img src>` cannot work and the bytes are turned into a blob URL instead. The
 * route is `no-store` on purpose; nothing here caches it beyond this view.
 */
export function useDocumentImage(documentId: number | null): {
  url: string | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
} {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(documentId !== null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const reload = useCallback(() => setAttempt((prev) => prev + 1), []);

  useEffect(() => {
    if (documentId === null) {
      setUrl(null);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setUrl(null);

    getKycDocumentImage(documentId, controller.signal)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        setUrl(objectUrl);
      })
      .catch((err: unknown) => {
        if (cancelled || err instanceof AbortedError) return;
        setError(describeError(err, "Document image"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [documentId, attempt]);

  return { url, loading, error, reload };
}

/**
 * A listing of documents that does not show them. The bytes are fetched only when
 * the link is opened: every read of the image route is written to the audit trail,
 * so a history list that rendered its thumbnails would record a dozen views that
 * nobody made.
 */
export function DocumentLink({
  documentId,
  label,
  detail,
}: {
  documentId: number;
  label: string;
  detail?: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setOpen(true)}
        trailing={<Icon name="search" className="h-3.5 w-3.5" />}
      >
        {label}
      </Button>
      {/* The dialog renders nothing until it opens, so nothing is fetched before then. */}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={label}
        description="Fetched now, and this read is recorded in the audit trail."
      >
        <StoredImage documentId={documentId} alt={label} />
        {detail ? <div className="mt-3 text-label leading-4 text-ink-faint">{detail}</div> : null}
      </Dialog>
    </>
  );
}

function StoredImage({ documentId, alt }: { documentId: number; alt: string }) {
  const { url, loading, error, reload } = useDocumentImage(documentId);

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center rounded-md border border-line">
        <Spinner className="h-5 w-5 text-ink-faint" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="space-y-3 rounded-md border border-line p-4">
        <p className="text-label leading-5 text-debit">{error}</p>
        <Button size="sm" variant="secondary" onClick={reload}>
          Try again
        </Button>
      </div>
    );
  }
  if (!url) {
    return <p className="text-label text-ink-faint">No image is stored for this side.</p>;
  }
  return <img src={url} alt={alt} className="max-h-[70vh] w-full bg-white object-contain" />;
}

/**
 * One stored document, readable by its owner or the review desk. Enlarging does
 * not refetch: the same bytes are shown larger, so a reviewer looking closely at
 * one image is one read, not two.
 */
export function DocumentImageView({
  documentId,
  alt,
  summary,
  frameClassName = "h-36",
}: {
  documentId: number;
  alt: string;
  summary?: ReactNode;
  frameClassName?: string;
}) {
  const { url, loading, error } = useDocumentImage(documentId);
  const [enlarged, setEnlarged] = useState(false);

  return (
    <div className="space-y-2">
      <div
        className={`flex w-full items-center justify-center overflow-hidden rounded-md border border-line bg-white ${frameClassName}`}
      >
        {loading ? <Spinner className="h-5 w-5 text-ink-faint" /> : null}
        {!loading && error ? (
          <div className="flex flex-col items-center gap-1.5 px-3 text-center">
            <Icon name="alert" className="h-5 w-5 text-debit" />
            <p className="text-label leading-4 text-debit">{error}</p>
          </div>
        ) : null}
        {!loading && url ? (
          <img src={url} alt={alt} className="h-full w-full bg-white object-contain" />
        ) : null}
        {!loading && !url && !error ? (
          <p className="text-label text-ink-faint">No image stored for this side.</p>
        ) : null}
      </div>

      {summary ? <div className="text-label leading-4 text-ink-faint">{summary}</div> : null}

      <Button
        size="sm"
        variant="secondary"
        onClick={() => setEnlarged(true)}
        disabled={!url}
        trailing={<Icon name="search" className="h-3.5 w-3.5" />}
      >
        View full size
      </Button>

      <Dialog
        open={enlarged}
        onClose={() => setEnlarged(false)}
        title={alt}
        description="The stored image exactly as the service re-encoded it: JPEG, capped at 1600px, stripped of EXIF."
      >
        {url ? (
          <img src={url} alt={alt} className="max-h-[70vh] w-full bg-white object-contain" />
        ) : (
          <Skeleton className="h-40 w-full" />
        )}
        {summary ? <div className="mt-3 text-label leading-4 text-ink-faint">{summary}</div> : null}
      </Dialog>
    </div>
  );
}
