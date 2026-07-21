"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useHasRole } from "@/components/auth/role-context";

/**
 * Acción en lote sobre un desvío del embudo: regenerar todos los links vencidos
 * o reintentar todos los que quedaron en error.
 *
 * Cada acción llama a EasyLex, así que el backend procesa en tandas acotadas.
 * Aquí se confirma explícitamente (menciona el tope y que crea documentos
 * reales) y se muestra el resultado, con cuántos quedan para volver a pulsar.
 */

export function StageBatchAction({
  status,
  count,
  label,
  actionLabel,
  noun,
}: {
  status: "link_expirado" | "error";
  count: number;
  label: string;
  /** Texto del botón: "Regenerar todos" / "Reintentar todos". */
  actionLabel: string;
  /** Sustantivo de la acción para el mensaje: "regenerarán" / "reintentarán". */
  noun: string;
}) {
  const router = useRouter();
  const canRun = useHasRole("operaciones");
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    const confirmed = window.confirm(
      `Se ${noun} hasta 25 de ${count} ${label.toLowerCase()} (por tanda). Cada uno crea un documento en EasyLex. ¿Continuar?`,
    );
    if (!confirmed) return;

    setMessage(null);
    setRunning(true);
    try {
      const res = await fetch("/api/backoffice/contracts/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      setRunning(false);
      if (!res.ok || !data.ok) {
        setMessage(data.error ?? `Error ${res.status}.`);
        return;
      }
      const parts = [`${data.succeeded} hechos`];
      if (data.skipped) parts.push(`${data.skipped} omitidos`);
      if (data.failed) parts.push(`${data.failed} con error`);
      const restante = data.remaining > 0 ? ` · quedan ${data.remaining}` : "";
      setMessage(`${parts.join(" · ")}${restante}.`);
      router.refresh();
    } catch (error) {
      setRunning(false);
      setMessage(error instanceof Error ? error.message : "Error de red.");
    }
  }

  if (count === 0) return null;

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={run}
        disabled={!canRun || running}
        title={canRun ? undefined : "Requiere rol operaciones."}
        className="rounded-md border border-border bg-surface px-2 py-0.5 text-[11px] font-semibold text-text-secondary transition hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
      >
        {running ? "Procesando…" : actionLabel}
      </button>
      {message && <span className="text-[10px] text-text-muted">{message}</span>}
    </span>
  );
}
