"use client";

import * as React from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/cn";

export type ToastVariant = "default" | "success" | "warn" | "error";

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
}

interface ToastContextValue {
  toast: (props: Omit<ToastItem, "id">) => void;
  dismiss: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);

  const dismiss = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = React.useCallback(
    ({ title, description, variant = "default", duration = 4000 }: Omit<ToastItem, "id">) => {
      const id = Math.random().toString(36).substring(2, 9);
      const newToast: ToastItem = { id, title, description, variant, duration };

      setToasts((prev) => [...prev, newToast]);

      if (duration > 0) {
        setTimeout(() => {
          dismiss(id);
        }, duration);
      }
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      {/* Toast viewport */}
      <div
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex items-start gap-3 rounded-xl border p-4 shadow-lg backdrop-blur-md transition-all duration-200 animate-in slide-in-from-bottom-2",
              t.variant === "success" && "border-emerald-500/30 bg-surface text-foreground",
              t.variant === "error" && "border-red-500/30 bg-surface text-foreground",
              t.variant === "warn" && "border-amber-500/30 bg-surface text-foreground",
              (t.variant === "default" || !t.variant) && "border-border bg-surface text-foreground",
            )}
          >
            {t.variant === "success" && <CheckCircle2 className="size-4 shrink-0 text-emerald-500 mt-0.5" />}
            {t.variant === "error" && <AlertCircle className="size-4 shrink-0 text-red-500 mt-0.5" />}
            {t.variant === "warn" && <AlertCircle className="size-4 shrink-0 text-amber-500 mt-0.5" />}
            {(!t.variant || t.variant === "default") && <Info className="size-4 shrink-0 text-brand-text mt-0.5" />}

            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-semibold">{t.title}</h4>
              {t.description && <p className="mt-0.5 text-xs text-muted leading-relaxed">{t.description}</p>}
            </div>

            <button
              onClick={() => dismiss(t.id)}
              className="text-muted hover:text-foreground p-0.5 rounded transition-colors"
              aria-label="Dismiss toast"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

