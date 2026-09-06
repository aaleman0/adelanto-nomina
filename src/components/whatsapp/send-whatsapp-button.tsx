"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useHasRole } from "@/components/auth/role-context";

/**
 * Envía el mensaje de WhatsApp a UN empleado, sin pasar por el asistente de
 * lote. Usa el mismo endpoint (`/api/whatsapp/bulk` en modo manual con un solo
 * id), así que reutiliza toda la lógica de envío ya existente.
 *
 * Cierra el bucle de "revisar y actuar en pantallas distintas": el operador
 * puede enviar desde donde está mirando al empleado (inspector del cockpit,
 * expediente), en vez de ir a re-seleccionarlo por importación.
 *
 * Enviar exige rol operaciones; sin él, el botón se deshabilita con su motivo.
 */

type SendState =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "done"; sent: number; failed: number }
  | { status: "error"; message: string };

export function SendWhatsAppButton({
  employeeId,
  employeeName,
  variant = "primary",
  className,
  size = "default",
}: {
  employeeId: string;
  employeeName?: string | null;
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
  size?: "default" | "small";
}) {
  const router = useRouter();
  const canSend = useHasRole("operaciones");
  const [state, setState] = useState<SendState>({ status: "idle" });

  async function send() {
    const quien = employeeName ? `a ${employeeName}` : "a este empleado";
    if (!window.confirm(`Se enviará el mensaje de WhatsApp ${quien}. ¿Continuar?`)) return;

    setState({ status: "sending" });
    try {
      const res = await fetch("/api/whatsapp/bulk?action=send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "manual", employeeIds: [employeeId] }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setState({ status: "error", message: data.error ?? `Error ${res.status}` });
        return;
      }

      setState({ status: "done", sent: data.sent ?? 0, failed: data.failed ?? 0 });
      // Refrescar para que el estado del empleado (pendiente → enviado) se vea.
      router.refresh();
    } catch (error) {
      setState({ status: "error", message: error instanceof Error ? error.message : "Error de red." });
    }
  }

  const sending = state.status === "sending";
  const sizeClass = size === "small" ? "h-8 px-2.5 text-xs" : "";

  return (
    <div className="flex flex-col gap-1">
      <Button
        variant={variant}
        className={[sizeClass, className].filter(Boolean).join(" ")}
        disabled={sending || !canSend}
        onClick={send}
        title={canSend ? undefined : "Requiere rol operaciones."}
        type="button"
      >
        {sending ? "Enviando…" : "Enviar WhatsApp"}
      </Button>

      {state.status === "done" && (
        <p className={["text-xs", state.sent > 0 ? "text-success" : "text-warning"].join(" ")}>
          {state.sent > 0
            ? `Enviado (${state.sent}).`
            : state.failed > 0
              ? "No se pudo enviar. Revisa el teléfono o la conexión de WhatsApp."
              : "Sin destinatarios elegibles."}
        </p>
      )}
      {state.status === "error" && <p className="text-xs text-danger">{state.message}</p>}
    </div>
  );
}
