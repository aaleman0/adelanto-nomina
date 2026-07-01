"use client";

import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DEFAULT_LANGUAGE } from "./whatsapp-readiness-card";
import type { SendMode } from "./types";

type Props = {
  selectedCount: number;
  templateName: string;
  mode: SendMode;
  importFilename?: string | null;
  sending: boolean;
  error: string | null;
  onConfirm: () => void;
  onBack: () => void;
};

function humanizeError(error: string): { title: string; detail: string } {
  const lower = error.toLowerCase();
  if (lower.includes("token") || lower.includes("authorization") || lower.includes("oauth")) {
    return {
      title: "Token de Meta expirado o inválido",
      detail: "Revisa la configuración de WhatsApp en la sección de ajustes y actualiza el token de acceso.",
    };
  }
  if (lower.includes("number of parameters") || lower.includes("132000")) {
    return {
      title: "Variables de plantilla incorrectas",
      detail: "El número de variables enviadas no coincide con la plantilla. Verifica la plantilla seleccionada.",
    };
  }
  if (lower.includes("not approved") || lower.includes("no aprobada") || lower.includes("template_paused") || lower.includes("template unavailable")) {
    return {
      title: "Plantilla no aprobada",
      detail: "Espera la aprobación de Meta o selecciona una plantilla aprobada.",
    };
  }
  if (lower.includes("phone") || lower.includes("teléfono") || lower.includes("phone_number") || lower.includes("recipient")) {
    return {
      title: "Número de teléfono inválido",
      detail: "Revisa el teléfono del empleado. Debe estar en formato internacional (+52...).",
    };
  }
  if (lower.includes("credencial") || lower.includes("configurad")) {
    return {
      title: "WhatsApp no configurado",
      detail: "Faltan credenciales de Meta. Ve a Configuración → WhatsApp y completa los datos.",
    };
  }
  return {
    title: "Error al enviar",
    detail: error,
  };
}

export function SendConfirmation({
  selectedCount,
  templateName,
  mode,
  importFilename,
  sending,
  error,
  onConfirm,
  onBack,
}: Props) {
  const parsedError = error ? humanizeError(error) : null;

  return (
    <div className="flex flex-col gap-5">
      <Card className="border-primary/20 bg-primary/5">
        <CardBody className="flex flex-col gap-5">
          {/* Encabezado */}
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <svg
                className="h-6 w-6 text-primary"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.75}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
                />
              </svg>
            </div>
            <div>
              <p className="text-base font-bold text-text-primary">
                Vas a enviar mensajes a{" "}
                <span className="text-primary">
                  {selectedCount} empleado{selectedCount !== 1 ? "s" : ""}
                </span>
              </p>
              <p className="mt-0.5 text-sm text-text-muted">
                Revisa el resumen antes de confirmar. Este envío no se puede deshacer.
              </p>
            </div>
          </div>

          {/* Resumen */}
          <div className="rounded-xl border border-border bg-surface divide-y divide-border">
            <SummaryRow label="Destinatarios" value={`${selectedCount} empleado${selectedCount !== 1 ? "s" : ""}`} />
            <SummaryRow
              label="Mensaje (plantilla)"
              value={
                <span className="flex flex-wrap items-center gap-2">
                  <code className="font-mono text-xs font-semibold text-text-primary">
                    {templateName}
                  </code>
                  <span className="text-xs text-text-muted">
                    · Idioma: {DEFAULT_LANGUAGE}
                  </span>
                </span>
              }
            />
            <SummaryRow
              label="Fuente de destinatarios"
              value={
                mode === "import"
                  ? importFilename
                    ? `Importación: ${importFilename}`
                    : "Importación seleccionada"
                  : "Selección manual"
              }
            />
          </div>

          {/* Aviso importante */}
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <svg
              className="mt-0.5 h-4 w-4 shrink-0 text-amber-600"
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
            <p className="text-xs text-amber-800">
              Los mensajes se enviarán inmediatamente a todos los teléfonos registrados. Una vez iniciado, no es posible cancelar el envío.
            </p>
          </div>

          {/* Error accionable */}
          {parsedError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-sm font-bold text-red-800">{parsedError.title}</p>
              <p className="mt-1 text-xs text-red-700">{parsedError.detail}</p>
            </div>
          )}

          {/* Botones */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="ghost" disabled={sending} onClick={onBack}>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
              Volver a editar
            </Button>
            <Button
              disabled={sending || selectedCount === 0}
              onClick={onConfirm}
              className="min-w-[220px]"
            >
              {sending ? (
                <>
                  <Spinner /> Enviando mensajes...
                </>
              ) : (
                <>
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
                    />
                  </svg>
                  Enviar mensajes por WhatsApp
                </>
              )}
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <p className="shrink-0 text-xs font-semibold text-text-muted">{label}</p>
      <div className="text-right text-sm font-semibold text-text-primary">{value}</div>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
