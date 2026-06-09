"use client";

import { useState, useEffect } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DEFAULT_TEMPLATE, DEFAULT_LANGUAGE } from "./whatsapp-readiness-card";

type TemplateStatus = "APPROVED" | "PENDING" | "REJECTED" | "DISABLED" | string;

type StoredTemplate = {
  id: string;
  name: string;
  status: TemplateStatus;
  category: string;
  language: string;
  components: Array<{ type: string; text?: string }>;
  synced_at: string;
};

type Props = {
  templateName: string;
  onTemplateChange: (name: string) => void;
  onNext: () => void;
  onBack: () => void;
};

const PREVIEW_TEXT =
  "Hola [Nombre], tienes disponible un adelanto de nómina por [Monto]. Para continuar con tu solicitud, revisa y firma tu contrato en el siguiente enlace.";
const PREVIEW_FOOTER = "Adelanto Nómina";

function templateStatusInfo(status: TemplateStatus): {
  label: string;
  tone: "ok" | "warn" | "error";
  canSend: boolean;
  message: string;
} {
  switch (status) {
    case "APPROVED":
      return {
        label: "Aprobada",
        tone: "ok",
        canSend: true,
        message: "Esta plantilla está aprobada por Meta y lista para enviar.",
      };
    case "PENDING":
      return {
        label: "En revisión",
        tone: "warn",
        canSend: false,
        message:
          "Meta aún está revisando esta plantilla. Puedes preparar el envío, pero no podrás enviarlo hasta que sea aprobada.",
      };
    case "REJECTED":
      return {
        label: "Rechazada",
        tone: "error",
        canSend: false,
        message:
          "Meta rechazó esta plantilla. Revisa los comentarios en WhatsApp Manager, corrige el contenido y vuelve a enviarla a revisión.",
      };
    default:
      return {
        label: status || "Desconocido",
        tone: "warn",
        canSend: false,
        message: "Esta plantilla no está disponible para enviar.",
      };
  }
}

function StatusPill({ status }: { status: TemplateStatus }) {
  const { label, tone } = templateStatusInfo(status);
  const cls =
    tone === "ok"
      ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
      : tone === "warn"
      ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
      : "bg-red-50 text-red-700 ring-1 ring-red-200";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
}

function WhatsAppPreview({ bodyText, footer }: { bodyText: string; footer?: string }) {
  return (
    <div className="mx-auto w-full max-w-xs rounded-2xl border border-border bg-[#e5ddd5] p-4">
      <div className="rounded-xl bg-white px-4 py-3 shadow-sm">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-text-primary">
          {bodyText}
        </p>
        {footer && (
          <p className="mt-2 text-xs text-text-muted">{footer}</p>
        )}
        <p className="mt-2 text-right text-[10px] text-text-muted">12:00 ✓✓</p>
      </div>
    </div>
  );
}

export function MessageTemplateStep({
  templateName,
  onTemplateChange,
  onNext,
  onBack,
}: Props) {
  const [templates, setTemplates] = useState<StoredTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    fetch("/api/whatsapp/templates")
      .then((r) => r.json())
      .then((json) => {
        if (json.ok) {
          const list: StoredTemplate[] = json.templates ?? [];
          setTemplates(list);
          // Auto-seleccionar adelanto_nomina si existe y no hay nada seleccionado
          if (!templateName || templateName === DEFAULT_TEMPLATE) {
            const main = list.find((t) => t.name === DEFAULT_TEMPLATE);
            if (main) onTemplateChange(main.name);
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    // Solo al montar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeTemplate = templates.find((t) => t.name === templateName);
  const statusInfo = activeTemplate
    ? templateStatusInfo(activeTemplate.status)
    : null;

  const canContinue =
    !!templateName && (statusInfo ? statusInfo.canSend : true);

  // Construir texto de preview desde componentes si hay template cargado
  const bodyText = (() => {
    if (!activeTemplate) return PREVIEW_TEXT;
    const body = activeTemplate.components.find((c) => c.type === "BODY");
    return body?.text
      ? body.text
          .replace(/\{\{1\}\}/g, "[Nombre]")
          .replace(/\{\{2\}\}/g, "[Monto]")
      : PREVIEW_TEXT;
  })();

  const footerText = (() => {
    if (!activeTemplate) return PREVIEW_FOOTER;
    const f = activeTemplate.components.find((c) => c.type === "FOOTER");
    return f?.text ?? PREVIEW_FOOTER;
  })();

  return (
    <div className="flex flex-col gap-5">
      {/* Vista principal del mensaje */}
      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <Card>
          <CardHeader>
            <h3 className="text-sm font-bold text-text-primary">Mensaje a enviar</h3>
            <p className="mt-0.5 text-xs text-text-muted">
              Este es el mensaje que recibirán los empleados en WhatsApp.
            </p>
          </CardHeader>
          <CardBody className="flex flex-col gap-4">
            {loading ? (
              <div className="h-12 animate-pulse rounded-xl bg-surface-muted" />
            ) : (
              <>
                {/* Plantilla principal seleccionada */}
                <div className="rounded-xl border border-border bg-surface-muted/40 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-text-primary">Adelanto de nómina</p>
                      <p className="mt-0.5 text-xs text-text-muted">
                        Plantilla Meta: <code className="font-mono">{templateName || DEFAULT_TEMPLATE}</code>
                        {" · "}Idioma: <code className="font-mono">{DEFAULT_LANGUAGE}</code>
                      </p>
                    </div>
                    {activeTemplate && (
                      <StatusPill status={activeTemplate.status} />
                    )}
                  </div>

                  {/* Alerta de estado */}
                  {statusInfo && !statusInfo.canSend && (
                    <div
                      className={[
                        "mt-3 rounded-lg px-3 py-2 text-xs",
                        statusInfo.tone === "warn"
                          ? "bg-amber-50 text-amber-800"
                          : "bg-red-50 text-red-800",
                      ].join(" ")}
                    >
                      {statusInfo.message}
                    </div>
                  )}
                </div>

                {/* Preview del texto */}
                <div>
                  <p className="mb-2 text-xs font-semibold text-text-muted uppercase tracking-widest">
                    Vista previa del mensaje
                  </p>
                  <div className="rounded-xl border border-border bg-surface-muted/30 p-4 text-sm leading-relaxed text-text-primary">
                    {bodyText}
                  </div>
                  <p className="mt-1.5 text-xs text-text-muted">
                    Los valores <span className="font-semibold text-text-primary">[Nombre]</span> y{" "}
                    <span className="font-semibold text-text-primary">[Monto]</span> se reemplazan automáticamente con los datos de cada empleado.
                  </p>
                </div>

                {/* Sección avanzada: cambiar template */}
                <div>
                  <button
                    type="button"
                    onClick={() => setShowAdvanced((v) => !v)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-text-muted hover:text-text-primary transition-colors"
                  >
                    <svg
                      className={["h-3.5 w-3.5 transition-transform", showAdvanced ? "rotate-90" : ""].join(" ")}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                    Opciones avanzadas (cambiar plantilla)
                  </button>

                  {showAdvanced && (
                    <div className="mt-3 rounded-xl border border-border bg-surface p-4">
                      <p className="mb-2 text-xs text-text-muted">
                        Solo cambia esto si necesitas usar una plantilla distinta. La plantilla por defecto es <code className="font-mono font-semibold">adelanto_nomina</code>.
                      </p>
                      {templates.length === 0 ? (
                        <p className="text-xs text-text-muted">
                          No hay plantillas sincronizadas. Usa el botón «Sincronizar plantillas» en la tarjeta de estado.
                        </p>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {templates.map((tmpl) => {
                            const info = templateStatusInfo(tmpl.status);
                            const isSelected = templateName === tmpl.name;
                            return (
                              <button
                                key={tmpl.id}
                                type="button"
                                onClick={() => onTemplateChange(tmpl.name)}
                                className={[
                                  "flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-all",
                                  isSelected
                                    ? "border-primary/50 bg-primary/5"
                                    : "border-border bg-surface hover:bg-surface-muted/40",
                                  !info.canSend ? "opacity-60" : "",
                                ].join(" ")}
                              >
                                <div>
                                  <p className="text-xs font-semibold text-text-primary">
                                    {tmpl.name}
                                  </p>
                                  <p className="text-[11px] text-text-muted">
                                    {tmpl.language} · {tmpl.category}
                                  </p>
                                </div>
                                <StatusPill status={tmpl.status} />
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </CardBody>
        </Card>

        {/* Preview visual WhatsApp */}
        <div className="flex flex-col gap-3">
          <p className="text-xs font-bold uppercase tracking-widest text-text-muted">
            Así se verá en WhatsApp
          </p>
          <WhatsAppPreview bodyText={bodyText} footer={footerText} />
        </div>
      </div>

      {/* Acciones */}
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={onBack}>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Volver
        </Button>
        <Button disabled={!canContinue} onClick={onNext}>
          Siguiente: Revisar destinatarios
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
          </svg>
        </Button>
      </div>
    </div>
  );
}
