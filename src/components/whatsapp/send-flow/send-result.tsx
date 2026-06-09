"use client";

import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { SendResult } from "./types";

type Props = {
  result: SendResult;
  templateName: string;
  onNewSend: () => void;
};

function humanizeErrorMessage(error: string): string {
  const lower = error.toLowerCase();
  if (lower.includes("token") || lower.includes("authorization") || lower.includes("oauth")) {
    return "Token de Meta expirado. Revisa la configuración de WhatsApp en ajustes.";
  }
  if (lower.includes("template") || lower.includes("approved")) {
    return "Plantilla no aprobada. Espera la aprobación de Meta o selecciona otra plantilla.";
  }
  if (lower.includes("phone") || lower.includes("number")) {
    return "Número de teléfono inválido. Revisa el teléfono del empleado.";
  }
  if (lower.includes("credencial") || lower.includes("configurad")) {
    return "Credenciales de WhatsApp no configuradas. Ve a Configuración → WhatsApp.";
  }
  return error;
}

export function SendResult({ result, templateName, onNewSend }: Props) {
  const allOk = result.failed === 0;
  const hasErrors = result.errors.length > 0;

  return (
    <div className="flex flex-col gap-5">
      {/* Banner principal */}
      <div
        className={[
          "flex flex-col items-center gap-4 rounded-2xl border px-8 py-10 text-center",
          allOk ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50",
        ].join(" ")}
      >
        <div
          className={[
            "grid h-16 w-16 place-items-center rounded-full",
            allOk ? "bg-emerald-100" : "bg-amber-100",
          ].join(" ")}
        >
          {allOk ? (
            <svg className="h-8 w-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          ) : (
            <svg className="h-8 w-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          )}
        </div>

        <div>
          <h2
            className={[
              "text-2xl font-bold",
              allOk ? "text-emerald-800" : "text-amber-800",
            ].join(" ")}
          >
            {allOk ? "¡Mensajes enviados!" : "Envío completado con errores"}
          </h2>
          <p
            className={[
              "mt-1 text-sm",
              allOk ? "text-emerald-700" : "text-amber-700",
            ].join(" ")}
          >
            {allOk
              ? `Se enviaron ${result.sent} mensaje${result.sent !== 1 ? "s" : ""} de WhatsApp correctamente.`
              : `${result.sent} enviado${result.sent !== 1 ? "s" : ""} correctamente · ${result.failed} fallaron.`}
          </p>
        </div>

        {/* Stats */}
        <div className="mt-2 grid w-full max-w-sm grid-cols-3 gap-3">
          <StatBig
            label="Enviados"
            value={result.sent}
            color={allOk ? "text-emerald-700" : "text-amber-700"}
          />
          <StatBig label="Procesados" value={result.total} color="text-text-primary" />
          <StatBig
            label="Errores"
            value={result.failed}
            color={result.failed > 0 ? "text-red-600" : "text-text-muted"}
          />
        </div>

        <p className="text-xs text-text-muted">
          Plantilla usada:{" "}
          <code className="font-mono font-semibold text-text-primary">{templateName}</code>
        </p>
      </div>

      {/* Detalle de errores */}
      {hasErrors && (
        <Card>
          <CardHeader>
            <h3 className="text-sm font-bold text-text-primary">
              Mensajes con error ({result.errors.length})
            </h3>
            <p className="mt-0.5 text-xs text-text-muted">
              Estos empleados no recibieron el mensaje. Revisa los detalles y toma acción.
            </p>
          </CardHeader>
          <CardBody className="p-0">
            <div className="max-h-52 overflow-y-auto divide-y divide-border">
              {result.errors.map((e, i) => {
                const friendly = humanizeErrorMessage(e.error);
                return (
                  <div key={i} className="flex flex-col gap-0.5 px-4 py-3 text-xs sm:flex-row sm:items-start sm:gap-4">
                    <span className="w-36 shrink-0 font-mono text-text-muted">
                      {e.rfc ?? e.employeeId}
                    </span>
                    <span className="text-red-600">{friendly}</span>
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Acciones post-envío */}
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={onNewSend}>
          Nuevo envío
        </Button>
        <a href="/whatsapp/history">
          <Button variant="ghost">
            Ver historial de envíos
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </Button>
        </a>
      </div>
    </div>
  );
}

function StatBig({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-3 text-center shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</p>
      <p className={`mt-1 text-3xl font-extrabold ${color}`}>{value}</p>
    </div>
  );
}
