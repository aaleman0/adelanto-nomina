"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useHasRole } from "@/components/auth/role-context";

/**
 * Acción en lote por etapa del embudo: envía WhatsApp a TODOS los empleados de
 * una etapa (hoy "Por contactar"), sin depender de la página visible ni de
 * seleccionar uno a uno.
 *
 * Es una acción de alta consecuencia (dispara mensajes reales a decenas de
 * personas), así que valida primero —para decir cuántos son elegibles de
 * verdad— y solo entonces pide confirmación explícita. El backend acota el
 * `status` permitido y filtra por elegibilidad; aquí solo se orquesta.
 */

type Phase = "idle" | "validating" | "sending";

export function StageBatchSend({
  status,
  count,
  label,
}: {
  status: string;
  count: number;
  label: string;
}) {
  const router = useRouter();
  const canSend = useHasRole("operaciones");
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setMessage(null);
    setPhase("validating");
    try {
      const validation = await fetch("/api/whatsapp/bulk?action=validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "status", status }),
      });
      const vData = await validation.json();
      if (!validation.ok || !vData.ok) {
        setPhase("idle");
        setMessage(vData.error ?? "No se pudo validar.");
        return;
      }

      const eligible: number = vData.eligible ?? 0;
      setPhase("idle");
      if (eligible === 0) {
        setMessage("Ninguno es elegible para enviar ahora.");
        return;
      }

      const confirmed = window.confirm(
        `Se enviará WhatsApp a ${eligible} elegible${eligible !== 1 ? "s" : ""} de ${count} ${label.toLowerCase()}. Esta acción manda mensajes reales. ¿Continuar?`,
      );
      if (!confirmed) return;

      setPhase("sending");
      const send = await fetch("/api/whatsapp/bulk?action=send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "status", status }),
      });
      const sData = await send.json();
      setPhase("idle");
      if (!send.ok || !sData.ok) {
        setMessage(sData.error ?? `Error ${send.status}.`);
        return;
      }

      setMessage(
        sData.status === "queued"
          ? `Encolados ${sData.queued ?? 0} envíos.`
          : `Enviado a ${sData.sent ?? 0}${sData.failed ? ` · ${sData.failed} con error` : ""}.`,
      );
      router.refresh();
    } catch (error) {
      setPhase("idle");
      setMessage(error instanceof Error ? error.message : "Error de red.");
    }
  }

  if (count === 0) return null;

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={run}
        disabled={!canSend || phase !== "idle"}
        title={canSend ? undefined : "Requiere rol operaciones."}
        className="inline-flex h-7 w-full items-center justify-center gap-1 rounded-md bg-primary px-2 text-[11px] font-semibold text-white transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {phase === "validating" ? "Validando…" : phase === "sending" ? "Enviando…" : "Enviar a todos"}
      </button>
      {message && <p className="mt-1 text-[10px] leading-tight text-text-muted">{message}</p>}
    </div>
  );
}
