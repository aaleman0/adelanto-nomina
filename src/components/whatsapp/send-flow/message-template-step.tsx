"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type TemplateStatus = "APPROVED" | "PENDING" | "REJECTED" | "DISABLED" | string;

type StoredTemplate = {
  id: string;
  name: string;
  status: TemplateStatus;
  components: Array<{ type: string; text?: string; buttons?: Array<{ type: string; url?: string }> }>;
};

type Props = {
  templateName: string;
  onTemplateChange: (name: string) => void;
  onNext: () => void;
  onBack: () => void;
};

const DEFAULT_TEMPLATE = "adelanto_nomina_v2";
const PREVIEW_TEXT = "Hola [Nombre], tienes disponible un adelanto de nómina por [Monto]. Para continuar con tu solicitud, revisa y firma tu contrato en el siguiente enlace.";

function templateStatusInfo(status: TemplateStatus) {
  switch (status) {
    case "APPROVED": return { label: "Aprobada", canSend: true, message: "Plantilla aprobada por Meta." };
    case "PENDING": return { label: "En revisión", canSend: false, message: "Meta aún revisa la plantilla." };
    case "REJECTED": return { label: "Rechazada", canSend: false, message: "Meta rechazó la plantilla." };
    default: return { label: status || "Desconocido", canSend: false, message: "Plantilla no disponible." };
  }
}

export function MessageTemplateStep({
  templateName,
  onTemplateChange,
  onNext,
  onBack,
}: Props) {
  const [templates, setTemplates] = useState<StoredTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/whatsapp/templates")
      .then((r) => r.json())
      .then((json) => {
        if (json.ok) {
          const list: StoredTemplate[] = json.templates ?? [];
          setTemplates(list);
          if (!templateName || templateName === DEFAULT_TEMPLATE) {
            const main = list.find((t) => t.name === DEFAULT_TEMPLATE);
            if (main) onTemplateChange(main.name);
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeTemplate = templates.find((t) => t.name === templateName);
  const statusInfo = activeTemplate ? templateStatusInfo(activeTemplate.status) : null;
  const canContinue = !!templateName && (statusInfo ? statusInfo.canSend : true);

  const bodyText = activeTemplate
    ? activeTemplate.components.find((c) => c.type === "BODY")?.text?.replace(/\{\{1\}\}/g, "[Nombre]").replace(/\{\{2\}\}/g, "[Empleador]").replace(/\{\{3\}\}/g, "[Monto]") ?? PREVIEW_TEXT
    : PREVIEW_TEXT;

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4">
        {loading ? (
          <div className="h-12 animate-pulse rounded-lg bg-surface-muted" />
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-sm font-medium text-text-primary">Mensaje a enviar</p>
              <p className="text-xs text-text-muted">Plantilla: <code className="font-mono">{templateName || DEFAULT_TEMPLATE}</code></p>
              {activeTemplate && <StatusBadge status={activeTemplate.status} />}
              {statusInfo && !statusInfo.canSend && <p className="mt-2 text-xs text-warning">{statusInfo.message}</p>}
            </div>

            <div className="rounded-lg border border-border bg-surface p-3 text-sm text-text-primary leading-relaxed">
              {bodyText}
            </div>

            {templates.length > 1 && (
              <div>
                <p className="text-xs font-medium text-text-muted">Cambiar plantilla</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {templates.map((tmpl) => (
                    <button
                      key={tmpl.id}
                      type="button"
                      onClick={() => onTemplateChange(tmpl.name)}
                      className={["rounded-lg border px-3 py-1.5 text-xs font-medium", templateName === tmpl.name ? "border-primary bg-primary-light text-primary" : "border-border bg-surface text-text-primary hover:bg-surface-muted"].join(" ")}
                    >
                      {tmpl.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={onBack}>Volver</Button>
        <Button disabled={!canContinue} onClick={onNext}>Siguiente</Button>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: TemplateStatus }) {
  const { label } = templateStatusInfo(status);
  const cls =
    status === "APPROVED" ? "text-success" :
    status === "PENDING" ? "text-warning" :
    status === "REJECTED" ? "text-danger" :
    "text-text-muted";
  return <span className={`inline-flex text-xs font-medium uppercase tracking-wide ${cls}`}>{label}</span>;
}
