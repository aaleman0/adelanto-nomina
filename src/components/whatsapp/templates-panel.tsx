"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";

type TemplateComponent = {
  type: string;
  text?: string;
};

type Template = {
  id: string;
  name: string;
  status: string;
  components: TemplateComponent[];
};

type LoadState = "loading" | "ok" | "error";

export function TemplatesPanel() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [selected, setSelected] = useState<Template | null>(null);
  const toastify = useToast();

  function fetchTemplates() {
    return fetch("/api/whatsapp/templates")
      .then((res) => res.json())
      .then((json: { ok: boolean; error?: string; templates?: Template[] }) => {
        if (!json.ok) throw new Error(json.error ?? "Error al cargar templates.");
        setTemplates(json.templates ?? []);
        setLoadState("ok");
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : "Error de red.");
        setLoadState("error");
      });
  }

  useEffect(() => {
    fetchTemplates();
  }, []);

  async function handleSync() {
    setSyncing(true);
    setLoadState("loading");
    setLoadError(null);
    try {
      const res = await fetch("/api/whatsapp/templates/sync", { method: "POST" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Error al sincronizar.");
      toastify.success(`Sincronizados ${json.synced} templates desde Meta.`);
      await fetchTemplates();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error de red.";
      setLoadError(msg);
      setLoadState("error");
      toastify.error(`Error al sincronizar templates: ${msg}`);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-muted">
          {templates.length > 0 && (
            <>
              {templates.length} templates · {templates.filter((t) => t.status === "APPROVED").length} aprobados
            </>
          )}
        </p>
        <Button variant="secondary" disabled={syncing} onClick={handleSync}>
          {syncing ? "Sincronizando..." : "Sincronizar desde Meta"}
        </Button>
      </div>

      {loadState === "loading" && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-surface-muted" />)}
        </div>
      )}

      {loadState === "error" && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p>{loadError}</p>
          <button onClick={() => { setLoadState("loading"); setLoadError(null); fetchTemplates(); }} className="mt-2 text-sm font-medium text-red-600 underline">
            Reintentar
          </button>
        </div>
      )}

      {loadState === "ok" && templates.length === 0 && (
        <EmptyState
          title="No hay templates sincronizados"
          description="Sincroniza los templates aprobados en tu cuenta de WhatsApp Business."
          action={<Button variant="secondary" disabled={syncing} onClick={handleSync}>Sincronizar desde Meta</Button>}
        />
      )}

      {loadState === "ok" && templates.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <Card className="p-4">
            <h3 className="text-sm font-medium text-text-muted">Templates</h3>
            <div className="mt-3 divide-y divide-border">
              {templates.map((tmpl) => (
                <button
                  key={tmpl.id}
                  onClick={() => setSelected(tmpl)}
                  className={["flex w-full items-center justify-between py-3 text-left", selected?.id === tmpl.id ? "text-primary" : "text-text-primary"].join(" ")}
                >
                  <span className="font-medium">{tmpl.name}</span>
                  <StatusBadge status={tmpl.status} />
                </button>
              ))}
            </div>
          </Card>

          <Card className="p-4">
            <h3 className="text-sm font-medium text-text-muted">Vista previa</h3>
            {selected ? (
              <div className="mt-3 space-y-2 text-sm">
                <p><span className="text-text-muted">Nombre:</span> {selected.name}</p>
                <p><span className="text-text-muted">Estado:</span> <StatusBadge status={selected.status} /></p>
                <div className="rounded-lg border border-border bg-surface p-3">
                  {selected.components.map((c, i) =>
                    c.text ? <p key={i} className="text-text-primary">{c.text}</p> : null
                  )}
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-text-muted">Selecciona un template para ver su contenido.</p>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    APPROVED: "bg-emerald-50 text-emerald-700 border-emerald-200",
    PENDING: "bg-amber-50 text-amber-700 border-amber-200",
    REJECTED: "bg-red-50 text-red-700 border-red-200",
    DISABLED: "bg-surface-muted text-text-muted border-border",
  };
  return (
    <span className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${map[status] ?? map.DISABLED}`}>
      {status}
    </span>
  );
}
