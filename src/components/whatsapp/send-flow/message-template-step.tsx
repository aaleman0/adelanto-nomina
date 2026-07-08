"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type TemplateStatus = "APPROVED" | "PENDING" | "REJECTED" | "DISABLED" | string;

type StoredTemplate = {
  id: string;
  name: string;
  status: TemplateStatus;
  components: Array<{ type: string; text?: string }>;
};

type Props = {
  templateName: string;
  onTemplateChange: (name: string) => void;
  buttonConfig: { text: string; url: string } | null;
  onButtonConfigChange: (config: { text: string; url: string } | null) => void;
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
  buttonConfig,
  onButtonConfigChange,
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
              {statusInfo && !statusInfo.canSend && <p className="mt-2 text-xs text-amber-700">{statusInfo.message}</p>}
            </div>

            <div className="rounded-lg border border-border bg-surface p-3 text-sm text-text-primary leading-relaxed">
              {bodyText}
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm text-text-primary">
                <input
                  type="checkbox"
                  checked={!!buttonConfig}
                  onChange={(e) => onButtonConfigChange(e.target.checked ? { text: "Ir al sitio", url: "https://adelanto-nomina.com/" } : null)}
                  className="rounded border-border text-primary"
                />
                Incluir botón de acción
              </label>
              {buttonConfig && (
                <div className="mt-2 flex gap-2">
                  <input
                    type="text"
                    value={buttonConfig.text}
                    onChange={(e) => onButtonConfigChange({ ...buttonConfig, text: e.target.value })}
                    className="h-9 flex-1 rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
                    maxLength={25}
                  />
                  <input
                    type="url"
                    value={buttonConfig.url}
                    onChange={(e) => onButtonConfigChange({ ...buttonConfig, url: e.target.value })}
                    className="h-9 flex-[2] rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
                    placeholder="https://..."
                  />
                </div>
              )}
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
    status === "APPROVED" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
    status === "PENDING" ? "bg-amber-50 text-amber-700 border-amber-200" :
    status === "REJECTED" ? "bg-red-50 text-red-700 border-red-200" :
    "bg-surface-muted text-text-muted border-border";
  return <span className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}
