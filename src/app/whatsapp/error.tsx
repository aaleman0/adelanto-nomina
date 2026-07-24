"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function WhatsAppError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[WhatsApp segment error]", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-full bg-red-100">
        <svg
          className="h-7 w-7 text-red-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
          />
        </svg>
      </div>

      <h1 className="mb-2 text-xl font-bold text-text-primary">
        Error en la sección de WhatsApp
      </h1>
      <p className="mb-1 max-w-md text-sm text-text-muted">
        {error.message ?? "Ocurrió un error inesperado al cargar esta sección."}
      </p>
      {error.digest && (
        <p className="mb-6 font-mono text-xs text-text-muted">
          Referencia: {error.digest}
        </p>
      )}

      <div className="flex flex-wrap justify-center gap-3">
        <button
          onClick={unstable_retry}
          className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white transition hover:bg-primary-hover"
        >
          Reintentar
        </button>
        <Link
          href="/whatsapp"
          className="rounded-lg border border-border bg-surface px-5 py-2.5 text-sm font-medium text-text-primary transition hover:bg-surface-muted"
        >
          Ir al Dashboard
        </Link>
      </div>
    </div>
  );
}
