"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ToastTone = "success" | "error" | "info";

export interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  body?: string;
}

interface ToastContextValue {
  toasts: Toast[];
  push: (toast: Omit<Toast, "id">) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_BORDER: Record<ToastTone, string> = {
  success: "border-l-accent",
  error: "border-l-debit",
  info: "border-l-ink",
};

const TONE_TEXT: Record<ToastTone, string> = {
  success: "text-accent",
  error: "text-debit",
  info: "text-ink",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (toast: Omit<Toast, "id">) => {
      seq.current += 1;
      const id = seq.current;
      setToasts((prev) => [...prev.slice(-2), { ...toast, id }]);
      window.setTimeout(() => dismiss(id), toast.tone === "error" ? 9000 : 5000);
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({ toasts, push, dismiss }),
    [toasts, push, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-[env(safe-area-inset-bottom)] z-40 space-y-2 p-4 sm:bottom-4 sm:left-auto sm:right-4 sm:w-96 sm:p-0"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.tone === "error" ? "alert" : "status"}
            className={`pointer-events-auto animate-fade-in rounded-md border border-line border-l-2 ${TONE_BORDER[toast.tone]} bg-white px-4 py-3`}
          >
            <div className="flex items-start justify-between gap-3">
              <p className={`text-body font-semibold ${TONE_TEXT[toast.tone]}`}>{toast.title}</p>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label="Dismiss"
                className="-mr-1 -mt-1 rounded px-1 text-ink-faint hover:text-ink"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
            {toast.body ? (
              <p className="mt-1 text-label leading-5 text-ink-muted">{toast.body}</p>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
