"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/Button";
import { SummaryRow } from "@/components/ui/Field";
import { Dialog } from "@/components/ui/Dialog";

export interface ActionFact {
  label: string;
  value: ReactNode;
}

/**
 * Every operations decision about a real person's money or access goes through
 * here. The confirm step restates the consequence rather than asking "are you
 * sure", and the dialog stops being dismissable once the request is in flight — a
 * suspension that lands after the reviewer closed the panel is still a suspension.
 */
export function ConfirmAction({
  open,
  onClose,
  onConfirm,
  title,
  body,
  facts,
  confirmLabel,
  tone = "primary",
  busy = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body: ReactNode;
  facts?: ActionFact[];
  confirmLabel: string;
  tone?: "primary" | "danger";
  busy?: boolean;
}) {
  if (!open) return null;

  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      dismissable={!busy}
      description={body}
      footer={
        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <Button
            block
            variant={tone === "danger" ? "danger" : "primary"}
            onClick={onConfirm}
            loading={busy}
            disabled={busy}
          >
            {confirmLabel}
          </Button>
          <Button block variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
        </div>
      }
    >
      {facts && facts.length > 0 ? (
        <dl>
          {facts.map((fact) => (
            <SummaryRow key={fact.label} label={fact.label} value={fact.value} />
          ))}
        </dl>
      ) : (
        <p className="text-label leading-5 text-ink-faint">
          Nothing has been changed yet. This is the last step before it is.
        </p>
      )}
    </Dialog>
  );
}
