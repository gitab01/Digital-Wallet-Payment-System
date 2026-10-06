"use client";

import { useEffect, useRef, useState } from "react";

import { formatBytes } from "@/lib/money";
import { ACCEPTED_IMAGE_TYPES } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

/**
 * One side of an identity document: a camera-first picker with a thumbnail of
 * whatever was chosen. The file never reaches the network from here — the caller
 * decides when to upload, which is what lets signup batch both sides after the
 * account exists.
 */
export function DocumentPhotoField({
  label,
  file,
  error,
  busy = false,
  disabled = false,
  emptyHint = "Not photographed yet.",
  onPick,
  onClear,
}: {
  label: string;
  file: File | null;
  error?: string | null;
  busy?: boolean;
  disabled?: boolean;
  emptyHint?: string;
  onPick: (file: File) => void;
  onClear?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  /* The thumbnail is a blob URL, so it has to be revoked the moment it is swapped. */
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const accepted = ACCEPTED_IMAGE_TYPES.join(",");

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="label">
          {label}
          <span aria-hidden="true"> *</span>
        </p>
        {file ? (
          <span className="text-label uppercase tracking-wide text-accent">Chosen</span>
        ) : null}
      </div>

      {file && previewUrl ? (
        <div className="relative overflow-hidden rounded-md border border-line">
          <img
            src={previewUrl}
            alt={`${label} preview`}
            className="h-36 w-full bg-white object-contain"
          />
          <div className="flex items-center justify-between gap-2 border-t border-line px-2 py-1.5">
            <span className="truncate text-label text-ink-faint" title={file.name}>
              {file.name}
            </span>
            <span className="num shrink-0 text-label text-ink-faint">{formatBytes(file.size)}</span>
          </div>
        </div>
      ) : (
        <div className="flex h-36 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-line px-3 text-center">
          <Icon name="camera" className="h-6 w-6 text-ink-faint" />
          <p className="text-label leading-4 text-ink-faint">{emptyHint}</p>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={accepted}
        capture="environment"
        aria-label={`Photo of the ${label.toLowerCase()}`}
        className="sr-only"
        disabled={disabled || busy}
        onChange={(event) => {
          const picked = event.target.files?.[0];
          /* Cleared so choosing the same file again still fires a change event. */
          event.target.value = "";
          if (picked) onPick(picked);
        }}
      />

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          size="sm"
          variant={file ? "secondary" : "primary"}
          block
          disabled={disabled || busy}
          loading={busy}
          onClick={() => inputRef.current?.click()}
        >
          {file ? "Retake" : "Take photo"}
        </Button>
        {file && onClear ? (
          <Button size="sm" variant="ghost" block disabled={disabled || busy} onClick={onClear}>
            Remove
          </Button>
        ) : null}
      </div>

      {error ? (
        <p className="text-label leading-4 text-debit" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
