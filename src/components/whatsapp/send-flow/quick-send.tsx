"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useHasRole } from "@/components/auth/role-context";
import type { RecentImport } from "./types";

/**
 * Envío rápido: el caso común en un clic.
 *
 * El asistente de 4 pasos es necesario cuando hay que elegir plantilla, filtrar
 * empleados o hacer un envío de prueba. Pero el 90% de las veces la tarea es
 * "manda a la última importación con la plantilla por defecto". Esta tarjeta
 * colapsa eso: muestra la importación más reciente y envía sin más pasos,
 * reutilizando el mismo endpoint bulk que el asistente.
 *
 * El asistente completo sigue debajo para todo lo demás.
 */

type QuickState =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "done"; sent: number; failed: number; eligible: number }
  | { status: "error"; message: string };

function formatDate(value: string | null): string {
  if (!value) return "sin fecha";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "sin fecha";
  return new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", year: "numeric" }).format(d);
}

export function QuickSend() {
  const router = useRouter();
  const canSend = useHasRole("operaciones");
  const [latest, setLatest] = useState<RecentImport | null>(null);
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<QuickState>({ status: "idle" });

  useEffect(() => {
    fetch("/api/whatsapp/imports")
      .then((r) => r.json())
      .then((json) => {
        // El listado viene ordenado por fecha desc: la primera es la más reciente.
        if (json.ok && json.imports?.length) setLatest(json.imports[0]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function sendNow() {
    if (!latest) return;
    if (!window.confirm(`Se enviará a todos los elegibles de «${latest.filename ?? "la última importación"}» con la plantilla por defecto. ¿Continuar?`)) return;

    setState({ status: "sending" });
    try {
      const res = await fetch("/api/whatsapp/bulk?action=send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Sin templateName: el backend usa la plantilla por defecto.
        body: JSON.stringify({ mode: "import", importId: latest.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setState({ status: "error", message: data.error ?? `Error ${res.status}` });
        return;
      }
      setState({ status: "done", sent: data.sent ?? 0, failed: data.failed ?? 0, eligible: data.eligible ?? 0 });
      router.refresh();
    } catch (error) {
      setState({ status: "error", message: error instanceof Error ? error.message : "Error de red." });
    }
  }

  // Sin importaciones no hay atajo que ofrecer: no se renderiza nada.
  if (loading || !latest) return null;

  const sending = state.status === "sending";

  return (
    <Card className="border-primary/30 bg-primary-light/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-text-primary">Envío rápido</h3>
          <p className="mt-1 text-sm text-text-muted">
            A la última importación:{" "}
            <span className="font-medium text-text-primary">{latest.filename ?? "sin nombre"}</span>{" "}
            · {formatDate(latest.applied_at)} · {latest.total_rows ?? 0} empleados · plantilla por defecto
          </p>
        </div>
        <Button onClick={sendNow} disabled={sending || !canSend} title={canSend ? undefined : "Requiere rol operaciones."}>
          {sending ? "Enviando…" : "Enviar ahora"}
        </Button>
      </div>

      {state.status === "done" && (
        <p className="mt-3 text-sm text-text-primary">
          {state.sent > 0
            ? `Enviado a ${state.sent} de ${state.eligible} elegibles${state.failed > 0 ? ` · ${state.failed} con error` : ""}.`
            : "No se envió a nadie. Revisa elegibilidad o la conexión de WhatsApp."}
        </p>
      )}
      {state.status === "error" && <p className="mt-3 text-sm text-red-600">{state.message}</p>}

      <p className="mt-3 text-xs text-text-muted">
        ¿Necesitas elegir plantilla, filtrar empleados o probar? Usa el asistente completo abajo.
      </p>
    </Card>
  );
}
