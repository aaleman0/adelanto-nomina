"use client";

import { useState, useEffect } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

type TemplateComponent = {
  type: string;
  format?: string;
  text?: string;
  buttons?: Array<{ type: string; text: string; url?: string }>;
};

type Template = {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
  components: TemplateComponent[];
  synced_at: string;
};

type LoadState = "loading" | "ok" | "error";

const fmtDate = (d: string) =>
  new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date(d));

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    APPROVED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    PENDING: "bg-amber-50 text-amber-700 ring-amber-200",
    REJECTED: "bg-red-50 text-red-700 ring-red-200",
    DISABLED: "bg-slate-100 text-slate-600 ring-slate-200",
  };
  const cls = map[status] ?? "bg-slate-100 text-slate-600 ring-slate-200";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${cls}`}>
      {status}
    </span>
  );
}

function TemplatePreview({ template }: { template: Template | null }) {
  if (!template) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-border bg-surface-muted/40 p-8 text-sm text-text-muted">
        Selecciona un template para ver su vista previa
      </div>
    );
  }

  const header = template.components.find((c) => c.type === "HEADER");
  const body = template.components.find((c) => c.type === "BODY");
  const footer = template.components.find((c) => c.type === "FOOTER");
  const buttons = template.components.find((c) => c.type === "BUTTONS");

  return (
    <div className="flex flex-col gap-3">
      {/* WhatsApp bubble mockup */}
      <div className="mx-auto w-full max-w-sm rounded-2xl border border-border bg-[#e5ddd5] p-4">
        <div className="rounded-xl bg-white px-4 py-3 shadow-sm">
          {header && header.text && (
            <p className="mb-2 text-sm font-bold text-text-primary">{header.text}</p>
          )}
          {body && body.text && (
            <p className="whitespace-pre-wrap text-sm text-text-primary leading-relaxed">{body.text}</p>
          )}
          {footer && footer.text && (
            <p className="mt-2 text-xs text-text-muted">{footer.text}</p>
          )}
          <p className="mt-2 text-right text-[10px] text-text-muted">12:00 ✓✓</p>
        </div>
        {buttons?.buttons && buttons.buttons.length > 0 && (
          <div className="mt-1 flex flex-col gap-1">
            {buttons.buttons.map((btn, i) => (
              <div
                key={i}
                className="rounded-xl bg-white px-4 py-2.5 text-center text-sm font-semibold text-[#0070ba] shadow-sm"
              >
                {btn.text}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Metadata */}
      <div className="rounded-xl border border-border bg-surface-muted/50 px-4 py-3 text-xs">
        <div className="grid grid-cols-2 gap-2">
          <div><span className="font-semibold text-text-muted">Nombre:</span> <span className="text-text-primary">{template.name}</span></div>
          <div><span className="font-semibold text-text-muted">Categoría:</span> <span className="text-text-primary">{template.category}</span></div>
          <div><span className="font-semibold text-text-muted">Idioma:</span> <span className="text-text-primary">{template.language}</span></div>
          <div><span className="font-semibold text-text-muted">Estado:</span> <StatusBadge status={template.status} /></div>
          <div className="col-span-2"><span className="font-semibold text-text-muted">Sincronizado:</span> <span className="text-text-primary">{fmtDate(template.synced_at)}</span></div>
        </div>
      </div>
    </div>
  );
}

export function TemplatesPanel() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [selected, setSelected] = useState<Template | null>(null);

  async function fetchTemplates() {
    setLoadState("loading");
    setLoadError(null);
    try {
      const res = await fetch("/api/whatsapp/templates");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Error al cargar templates.");
      setTemplates(json.templates ?? []);
      setLoadState("ok");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Error de red.");
      setLoadState("error");
    }
  }

  useEffect(() => { fetchTemplates(); }, []);

  async function handleSync() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch("/api/whatsapp/templates/sync", { method: "POST" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Error al sincronizar.");
      setSyncMsg({ ok: true, text: `Sincronizados ${json.synced} templates desde Meta.` });
      await fetchTemplates();
    } catch (err) {
      setSyncMsg({ ok: false, text: err instanceof Error ? err.message : "Error de red." });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {templates.length > 0 && (
            <p className="text-sm text-text-muted">
              <span className="font-semibold text-text-primary">{templates.length}</span> templates ·{" "}
              <span className="font-semibold text-emerald-600">
                {templates.filter((t) => t.status === "APPROVED").length} aprobados
              </span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {syncMsg && (
            <span className={`text-sm font-semibold ${syncMsg.ok ? "text-emerald-600" : "text-red-600"}`}>
              {syncMsg.text}
            </span>
          )}
          <Button variant="secondary" disabled={syncing} onClick={handleSync}>
            {syncing ? (
              <>
                <Spinner /> Sincronizando...
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Sincronizar desde Meta
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Loading skeleton */}
      {loadState === "loading" && (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-surface-muted" />
          ))}
        </div>
      )}

      {/* Error state */}
      {loadState === "error" && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4">
          <p className="text-sm font-semibold text-red-800">{loadError}</p>
          <button
            onClick={fetchTemplates}
            className="mt-2 text-sm font-semibold text-red-600 underline hover:no-underline"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Empty state */}
      {loadState === "ok" && templates.length === 0 && (
        <EmptyState
          title="No hay templates sincronizados"
          description="Haz clic en «Sincronizar desde Meta» para importar los templates aprobados en tu cuenta de WhatsApp Business."
          action={
            <Button variant="secondary" disabled={syncing} onClick={handleSync}>
              {syncing ? "Sincronizando..." : "Sincronizar desde Meta"}
            </Button>
          }
        />
      )}

      {/* Content — lista + preview en dos columnas */}
      {loadState === "ok" && templates.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          {/* Lista */}
          <Card>
            <CardHeader>
              <h3 className="text-h2 font-semibold text-text-primary">Templates disponibles</h3>
            </CardHeader>
            <CardBody className="p-0">
              <div className="divide-y divide-border">
                {templates.map((tmpl) => (
                  <button
                    key={tmpl.id}
                    onClick={() => setSelected(tmpl)}
                    className={[
                      "flex w-full items-center justify-between gap-4 px-6 py-4 text-left transition-colors hover:bg-surface-muted/50",
                      selected?.id === tmpl.id ? "bg-primary/5" : "",
                    ].join(" ")}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-text-primary">{tmpl.name}</p>
                      <p className="mt-0.5 text-xs text-text-muted">
                        {tmpl.category} · {tmpl.language} · Sync {fmtDate(tmpl.synced_at)}
                      </p>
                    </div>
                    <div className="shrink-0">
                      <StatusBadge status={tmpl.status} />
                    </div>
                  </button>
                ))}
              </div>
            </CardBody>
          </Card>

          {/* Preview */}
          <Card>
            <CardHeader>
              <h3 className="text-h2 font-semibold text-text-primary">Vista previa</h3>
            </CardHeader>
            <CardBody>
              <TemplatePreview template={selected} />
            </CardBody>
          </Card>
        </div>
      )}
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
