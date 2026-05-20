"use client";

import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";

/* ─── Types ─── */

export type ToastVariant = "success" | "error" | "warning" | "info";

export type Toast = {
  id: string;
  variant: ToastVariant;
  message: string;
  duration?: number; // ms, default 5000. 0 = permanente
};

type ToastContextValue = {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id">) => string;
  removeToast: (id: string) => void;
};

/* ─── Context ─── */

const ToastContext = createContext<ToastContextValue | null>(null);

let globalAddToast: ((toast: Omit<Toast, "id">) => string) | null = null;

/* ─── Provider ─── */

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((toast: Omit<Toast, "id">): string => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const duration = toast.duration ?? 5000;
    setToasts((prev) => [...prev.slice(-4), { ...toast, id, duration }]); // máx 5 toasts
    return id;
  }, []);

  // Exponemos addToast globalmente para uso fuera de componentes
  useEffect(() => {
    globalAddToast = addToast;
    return () => { globalAddToast = null; };
  }, [addToast]);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  );
}

/* ─── Hook ─── */

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast debe usarse dentro de <ToastProvider>");

  const { addToast, removeToast } = ctx;

  return {
    success: (message: string, duration?: number) =>
      addToast({ variant: "success", message, duration }),
    error: (message: string, duration?: number) =>
      addToast({ variant: "error", message, duration }),
    warning: (message: string, duration?: number) =>
      addToast({ variant: "warning", message, duration }),
    info: (message: string, duration?: number) =>
      addToast({ variant: "info", message, duration }),
    dismiss: removeToast,
  };
}

/**
 * API imperativa (para usar fuera de componentes React, ej: en callbacks).
 * Requiere que <ToastProvider> esté montado.
 */
export const toast = {
  success: (message: string, duration?: number) =>
    globalAddToast?.({ variant: "success", message, duration }),
  error: (message: string, duration?: number) =>
    globalAddToast?.({ variant: "error", message, duration }),
  warning: (message: string, duration?: number) =>
    globalAddToast?.({ variant: "warning", message, duration }),
  info: (message: string, duration?: number) =>
    globalAddToast?.({ variant: "info", message, duration }),
};

/* ─── Toast item ─── */

function ToastItem({ t, onRemove }: { t: Toast; onRemove: (id: string) => void }) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!t.duration) return;
    timerRef.current = setTimeout(() => onRemove(t.id), t.duration);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [t.id, t.duration, onRemove]);

  const styles: Record<ToastVariant, string> = {
    success: "bg-emerald-50 border-emerald-200 text-emerald-900",
    error: "bg-red-50 border-red-200 text-red-900",
    warning: "bg-amber-50 border-amber-200 text-amber-900",
    info: "bg-blue-50 border-blue-200 text-blue-900",
  };

  const iconColor: Record<ToastVariant, string> = {
    success: "text-emerald-600",
    error: "text-red-600",
    warning: "text-amber-600",
    info: "text-blue-600",
  };

  return (
    <div
      className={[
        "flex items-start gap-3 rounded-xl border px-4 py-3 shadow-md",
        "animate-in fade-in slide-in-from-right-4 duration-300",
        styles[t.variant],
      ].join(" ")}
      role="alert"
    >
      <ToastIcon variant={t.variant} className={`mt-0.5 h-5 w-5 shrink-0 ${iconColor[t.variant]}`} />
      <p className="flex-1 text-sm font-semibold leading-tight">{t.message}</p>
      <button
        onClick={() => onRemove(t.id)}
        className="ml-1 grid h-5 w-5 place-items-center rounded opacity-60 transition hover:opacity-100"
        aria-label="Cerrar notificación"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

/* ─── Container ─── */

function ToastContainer({
  toasts,
  removeToast,
}: {
  toasts: Toast[];
  removeToast: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="fixed bottom-5 right-5 z-[9999] flex w-80 flex-col gap-2"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} t={t} onRemove={removeToast} />
      ))}
    </div>
  );
}

/* ─── Icons ─── */

function ToastIcon({ variant, className }: { variant: ToastVariant; className?: string }) {
  if (variant === "success")
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );
  if (variant === "error")
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
      </svg>
    );
  if (variant === "warning")
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
    );
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
    </svg>
  );
}
