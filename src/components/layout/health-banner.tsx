"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * Banner de salud de infraestructura. Sondea `/api/health/whatsapp` (público) y
 * avisa cuando la conexión con WhatsApp no está disponible —típicamente el token
 * expirado—, para que el operador se entere ANTES de disparar un lote, no
 * fallándolo. El endpoint cachea la verificación real contra Meta, así que el
 * poll no golpea la API de Meta.
 */

const POLL_MS = 120_000;

type HealthResponse = {
  connection?: { ok: boolean; error: string | null };
};

export function HealthBanner() {
  const [issue, setIssue] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let alive = true;

    async function check() {
      try {
        const res = await fetch("/api/health/whatsapp", { cache: "no-store" });
        const data = (await res.json()) as HealthResponse;
        if (!alive) return;
        if (data.connection && !data.connection.ok) {
          setIssue(data.connection.error ?? "La conexión con WhatsApp no está disponible.");
          setDismissed(false); // un problema nuevo vuelve a mostrarse
        } else {
          setIssue(null);
        }
      } catch {
        // Un fallo de red del propio poll no debe pintar un banner.
      }
    }

    check();
    const id = setInterval(check, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (!issue || dismissed) return null;

  return (
    <div className="flex items-start gap-3 rounded-lg border border-[var(--warning)]/30 bg-warning-bg px-4 py-2.5 text-sm text-warning">
      <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      </svg>
      <div className="min-w-0 flex-1">
        <span className="font-semibold">WhatsApp:</span> {issue}{" "}
        <Link href="/settings/whatsapp" className="font-semibold underline hover:no-underline">
          Revisar conexión
        </Link>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Descartar aviso"
        className="shrink-0 rounded px-1 text-lg leading-none text-warning/70 hover:text-warning"
      >
        ×
      </button>
    </div>
  );
}
