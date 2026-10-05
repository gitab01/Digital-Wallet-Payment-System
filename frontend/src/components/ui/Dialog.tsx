"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Sheet on mobile, centred panel on desktop. Backdrop is solid white and the
 * panel carries a 1px black border — the depth comes from the rule, not a shadow.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  dismissable = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** False while money is in flight: no accidental escape. */
  dismissable?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && dismissable) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, dismissable]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-white sm:items-center sm:p-6">
      {dismissable ? (
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute inset-0 h-full w-full cursor-default bg-white"
        />
      ) : (
        <div className="absolute inset-0 bg-white" aria-hidden="true" />
      )}
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative max-h-[90vh] w-full overflow-y-auto rounded-t-xl border border-ink bg-white outline-none sm:max-w-lg sm:rounded-xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h2 className="section-title">{title}</h2>
            {description ? (
              <p className="mt-1 text-label leading-5 text-ink-faint">{description}</p>
            ) : null}
          </div>
          {dismissable ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="-mr-1 -mt-1 rounded p-1 text-ink-faint hover:text-ink"
            >
              <span aria-hidden="true" className="block text-h2 leading-none">
                ×
              </span>
            </button>
          ) : null}
        </header>
        <div className="px-5 py-4">{children}</div>
        {footer ? (
          <footer className="border-t border-line px-5 py-4">{footer}</footer>
        ) : null}
      </div>
    </div>
  );
}
