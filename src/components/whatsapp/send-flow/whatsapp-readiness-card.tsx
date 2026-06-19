"use client";

import { useState, useEffect } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export const DEFAULT_TEMPLATE = "adelanto_nomina_v2";
export const DEFAULT_LANGUAGE = "es_MX";

type TemplateStatus = "approved" | "pending" | "rejected" | "not_found" | "not_synced" | "loading";

type ReadinessState = {
  loading: boolean;
  envValid: boolean;
  envErrors: string[];
  businessNumber: string;
  templateStatus: TemplateStatus;
  syncing: boolean;
  syncError: string | null;
};

const templateStatusLabel: Record<TemplateStatus, string> = {
  approved: "Aprobada",
  pending: "En revisión por Meta",
  rejected: "Rechazada",
  not_found: "No encontrada",
  not_synced: "No sincronizada",
  loading: "Verificando...",
};

const templateStatusTone: Record<TemplateStatus, "ok" | "warn" | "error" | "neutral"> = {
  approved: "ok",
  pending: "warn",
  rejected: "error",
  not_found: "error",
  not_synced: "warn",
  loading: "neutral",
};

function CheckRow({
  label,
  ok,
  detail,
}: {
  label: string;
  ok: boolean | "neutral";
  detail?: string;
}) {
  return (
    <div className="flex items-start gap-3 py-2">
      <span
        className={[
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
          ok === true
            ? "bg-emerald-100 text-emerald-700"
            : ok === false
            ? "bg-red-100 text-red-600"
            : "bg-surface-muted text-text-muted",
        ].join(" ")}
      >
        {ok === true ? "✓" : ok === false ? "✗" : "–"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-text-primary">{label}</p>
        {detail && <p className="mt-0.5 text-xs text-text-muted">{detail}</p>}
      </div>
    </div>
  );
}

function TemplateStatusPill({ status }: { status: TemplateStatus }) {
  const tone = templateStatusTone[status];
  const cls =
    tone === "ok"
      ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
      : tone === "warn"
      ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
      : tone === "error"
      ? "bg-red-50 text-red-700 ring-1 ring-red-200"
      : "bg-surface-muted text-text-muted ring-1 ring-border";

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {templateStatusLabel[status]}
    </span>
  );
}

export function WhatsAppReadinessCard({
  onTemplateStatusChange,
}: {
  onTemplateStatusChange?: (status: TemplateStatus) => void;
}) {
  const [state, setState] = useState<ReadinessState>({
    loading: true,
    envValid: false,
    envErrors: [],
    businessNumber: "",
    templateStatus: "loading",
    syncing: false,
    syncError: null,
  });

  async function loadReadiness() {
    setState((s) => ({ ...s, loading: true }));
    try {
      const [configRes, templatesRes] = await Promise.all([
        fetch("/api/whatsapp/config").then((r) => r.json()),
        fetch("/api/whatsapp/templates").then((r) => r.json()),
      ]);

      const businessNumber: string =
        configRes?.config?.whatsapp_business_number ?? "";

      // Buscar la plantilla adelanto_nomina
      const templates: Array<{ name: string; status: string }> =
        templatesRes?.templates ?? [];

      let templateStatus: TemplateStatus = "not_synced";
      if (templates.length > 0) {
        const found = templates.find((t) => t.name === DEFAULT_TEMPLATE);
        if (!found) {
          templateStatus = "not_found";
        } else if (found.status === "APPROVED") {
          templateStatus = "approved";
        } else if (found.status === "PENDING") {
          templateStatus = "pending";
        } else if (found.status === "REJECTED") {
          templateStatus = "rejected";
        } else {
          templateStatus = "not_found";
        }
      }

      setState((s) => ({
        ...s,
        loading: false,
        envValid: configRes?.envValid ?? false,
        envErrors: configRes?.envErrors ?? [],
        businessNumber,
        templateStatus,
      }));

      onTemplateStatusChange?.(templateStatus);
    } catch {
      setState((s) => ({
        ...s,
        loading: false,
        templateStatus: "not_synced",
      }));
      onTemplateStatusChange?.("not_synced");
    }
  }

  async function handleSync() {
    setState((s) => ({ ...s, syncing: true, syncError: null }));
    try {
      const res = await fetch("/api/whatsapp/templates/sync", { method: "POST" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Error al sincronizar.");
      await loadReadiness();
    } catch (err) {
      setState((s) => ({
        ...s,
        syncing: false,
        syncError: err instanceof Error ? err.message : "Error al sincronizar.",
      }));
    }
  }

  useEffect(() => {
    loadReadiness();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isReady =
    state.envValid && state.templateStatus === "approved";

  const displayNumber = state.businessNumber
    ? state.businessNumber.startsWith("+")
      ? state.businessNumber
      : `+${state.businessNumber}`
    : null;

  if (state.loading) {
    return (
      <div className="h-16 animate-pulse rounded-2xl bg-surface-muted" />
    );
  }

  return (
    <Card
      className={[
        "border",
        isReady ? "border-emerald-200 bg-emerald-50/30" : "border-amber-200 bg-amber-50/30",
      ].join(" ")}
    >
      <CardHeader
        className={isReady ? "border-emerald-200/60" : "border-amber-200/60"}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span
              className={[
                "flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold",
                isReady ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700",
              ].join(" ")}
            >
              {isReady ? "✓" : "!"}
            </span>
            <div>
              <p className="text-sm font-bold text-text-primary">
                {isReady ? "WhatsApp listo para enviar" : "Revisa la configuración de WhatsApp"}
              </p>
              {displayNumber && (
                <p className="text-xs text-text-muted">
                  Mensajes enviados desde:{" "}
                  <span className="font-semibold text-text-primary">{displayNumber}</span>
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              className="h-8 px-3 text-xs"
              disabled={state.syncing}
              onClick={handleSync}
            >
              {state.syncing ? (
                <>
                  <Spinner /> Sincronizando...
                </>
              ) : (
                "Sincronizar plantillas"
              )}
            </Button>
            <Link href="/settings/whatsapp">
              <Button variant="ghost" className="h-8 px-3 text-xs">
                Configuración
              </Button>
            </Link>
          </div>
        </div>
      </CardHeader>

      <CardBody className="pt-3 pb-4">
        <div className="grid gap-0 divide-y divide-border/50 sm:grid-cols-2 sm:divide-y-0 sm:divide-x sm:gap-0">
          {/* Columna izquierda: credenciales */}
          <div className="pb-4 sm:pb-0 sm:pr-6">
            <p className="mb-1 text-[11px] font-bold uppercase tracking-widest text-text-muted">
              Configuración
            </p>
            <CheckRow
              label="Credenciales de Meta"
              ok={state.envValid}
              detail={
                state.envValid
                  ? "Token y Phone Number ID configurados"
                  : state.envErrors.length > 0
                  ? state.envErrors.join(" · ")
                  : "Falta configurar credenciales en ajustes"
              }
            />
            <CheckRow
              label="Número emisor"
              ok={!!displayNumber}
              detail={displayNumber ?? "No configurado"}
            />
          </div>

          {/* Columna derecha: plantilla */}
          <div className="pt-4 sm:pt-0 sm:pl-6">
            <p className="mb-1 text-[11px] font-bold uppercase tracking-widest text-text-muted">
              Plantilla
            </p>
            <div className="flex items-start gap-3 py-2">
              <span
                className={[
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                  state.templateStatus === "approved"
                    ? "bg-emerald-100 text-emerald-700"
                    : state.templateStatus === "loading"
                    ? "bg-surface-muted text-text-muted"
                    : "bg-amber-100 text-amber-700",
                ].join(" ")}
              >
                {state.templateStatus === "approved"
                  ? "✓"
                  : state.templateStatus === "loading"
                  ? "–"
                  : "!"}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-text-primary">
                    {DEFAULT_TEMPLATE}
                  </p>
                  <TemplateStatusPill status={state.templateStatus} />
                </div>
                <p className="mt-0.5 text-xs text-text-muted">
                  Idioma: {DEFAULT_LANGUAGE}
                </p>
                {state.templateStatus !== "approved" && (
                  <p className="mt-1.5 text-xs text-amber-700">
                    {state.templateStatus === "pending" &&
                      "Meta aún no aprueba la plantilla. Puedes preparar el envío, pero no enviarlo hasta que sea aprobada."}
                    {state.templateStatus === "not_found" &&
                      "La plantilla no existe en Meta. Créala en WhatsApp Manager y luego sincroniza."}
                    {state.templateStatus === "not_synced" &&
                      "Haz clic en «Sincronizar plantillas» para traer la lista desde Meta."}
                    {state.templateStatus === "rejected" &&
                      "Meta rechazó la plantilla. Revisa los comentarios en WhatsApp Manager y vuelve a enviarla."}
                  </p>
                )}
              </div>
            </div>

            {/* Instrucciones si no existe la plantilla */}
            {(state.templateStatus === "not_found" || state.templateStatus === "not_synced") && (
              <TemplateCreationGuide />
            )}

            {state.syncError && (
              <p className="mt-2 text-xs font-semibold text-red-600">{state.syncError}</p>
            )}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

function TemplateCreationGuide() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs font-semibold text-primary underline hover:no-underline"
      >
        {open ? "Ocultar instrucciones" : "¿Cómo crear la plantilla?"}
      </button>
      {open && (
        <ol className="mt-2 flex flex-col gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          <li>1. Ve a Meta Business → WhatsApp Manager → Plantillas de mensaje.</li>
          <li>2. Crea una plantilla nueva con el nombre exacto: <code className="font-mono font-bold">{DEFAULT_TEMPLATE}</code></li>
          <li>3. Categoría: <strong>Marketing</strong>. Idioma: <strong>Spanish (MEX) / es_MX</strong>.</li>
          <li>
            4. Texto del cuerpo:{" "}
            <em className="italic">
              &ldquo;Hola {`{{1}}`}, tienes disponible un adelanto de nómina por {`{{2}}`}. Para continuar con tu solicitud, revisa y firma tu contrato en el siguiente enlace.&rdquo;
            </em>
          </li>
          <li>5. Ejemplos: {`{{1}}`} = José · {`{{2}}`} = $5,000.00</li>
          <li>6. Pie de página: <strong>Adelanto Nómina</strong>.</li>
          <li>7. Envía a revisión. Una vez aprobada, haz clic en «Sincronizar plantillas».</li>
          <li className="font-semibold text-amber-900 mt-1">
            Nota: <code className="font-mono">hello_world</code> solo funciona con números de prueba públicos de Meta, no con tu número real.
          </li>
        </ol>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
