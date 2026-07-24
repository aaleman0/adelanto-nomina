"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ErrorBoundary } from "@/components/error-boundary";
import { StatusBadge } from "@/components/ui/status-badge";

type Stats = { sentToday: number; deliveryRate: number; errorsToday: number; totalDelivered: number };
type RecentMessage = { id: string; employee_id: string; nombre: string | null; apellidos: string | null; message_type: string; delivery_status: string | null; created_at: string | null };

const dateFormatter = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" });

export function WhatsAppDashboard() {
  return <ErrorBoundary section="WhatsApp Dashboard"><WhatsAppDashboardInner /></ErrorBoundary>;
}

function WhatsAppDashboardInner() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<RecentMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(() => fetch("/api/whatsapp/stats").then((response) => response.json()).then((json) => {
    if (!json.ok) throw new Error(json.error ?? "Error al cargar el resumen.");
    setStats(json.stats);
    setRecent(json.recent ?? []);
  }), []);

  useEffect(() => {
    let cancelled = false;
    loadStats().catch((reason) => { if (!cancelled) setError(reason.message); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [loadStats]);

  function retry() {
    setLoading(true);
    setError(null);
    loadStats().catch((reason) => setError(reason.message)).finally(() => setLoading(false));
  }

  if (error) return <div className="border-y border-danger-border py-5 text-sm text-danger"><p>No pudimos actualizar el resumen de WhatsApp.</p><button type="button" onClick={retry} className="mt-2 font-semibold underline underline-offset-4">Reintentar</button></div>;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <section className="grid shrink-0 border-y border-border sm:grid-cols-3" aria-label="Estado de mensajería">
        <Signal label="Enviados hoy" value={stats?.sentToday ?? 0} loading={loading} />
        <Signal label="Entrega" value={`${stats?.deliveryRate ?? 0}%`} loading={loading} tone={(stats?.deliveryRate ?? 0) >= 90 ? "success" : "warning"} />
        <Signal label="Errores hoy" value={stats?.errorsToday ?? 0} loading={loading} tone={(stats?.errorsToday ?? 0) > 0 ? "danger" : "success"} />
      </section>

      <section className="mt-7 flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-end justify-between gap-4 border-b border-border pb-3">
          <div><h2 className="font-display text-lg font-semibold text-text-primary">Actividad reciente</h2><p className="mt-0.5 text-xs text-text-muted">Últimos movimientos reportados por WhatsApp.</p></div>
          <Link href="/whatsapp/history" className="shrink-0 text-xs font-semibold text-primary hover:text-primary-hover">Ver historial completo</Link>
        </div>

        <div className="panel-scroll min-h-0 flex-1">
          <div className="sticky top-0 z-10 hidden grid-cols-[minmax(220px,1.3fr)_1fr_160px_120px] gap-4 border-b border-border bg-[var(--background)] px-2 py-3 text-[10px] font-semibold uppercase tracking-[.12em] text-text-muted md:grid">
            <span>Empleado</span><span>Tipo</span><span>Fecha</span><span>Resultado</span>
          </div>
          {loading ? <LoadingRows /> : recent.length === 0 ? <div className="py-12 text-center"><p className="text-sm font-medium text-text-primary">Todavía no hay envíos</p><p className="mt-1 text-xs text-text-muted">Los mensajes aparecerán aquí cuando comience la operación.</p></div> : recent.map((message) => <MessageRow key={message.id} message={message} />)}
        </div>
      </section>
    </div>
  );
}

function Signal({ label, value, loading, tone = "neutral" }: { label: string; value: string | number; loading: boolean; tone?: "neutral" | "success" | "warning" | "danger" }) {
  const color = { neutral: "bg-[var(--color-3)]", success: "bg-success", warning: "bg-warning", danger: "bg-danger" }[tone];
  return <div className="flex items-center gap-3 border-b border-border px-2 py-5 last:border-b-0 sm:border-b-0 sm:border-r sm:px-6 sm:first:pl-0 sm:last:border-r-0"><span className={`h-2.5 w-2.5 rounded-full ${color}`} /><div><p className="text-xs text-text-muted">{label}</p>{loading ? <span className="skeleton-bone mt-1 block h-7 w-16 rounded" /> : <p className="font-data mt-0.5 text-2xl font-semibold text-text-primary">{value}</p>}</div></div>;
}

function MessageRow({ message }: { message: RecentMessage }) {
  const fullName = [message.nombre, message.apellidos].filter(Boolean).join(" ") || "Empleado sin nombre";
  return <Link href={`/contracts/${message.employee_id}`} className="interactive-row grid gap-2 border-b border-border-subtle px-2 py-4 text-sm md:grid-cols-[minmax(220px,1.3fr)_1fr_160px_120px] md:items-center md:gap-4"><div><p className="font-semibold text-text-primary">{fullName}</p><p className="font-data text-[10px] text-text-muted">{message.employee_id.slice(0, 12)}</p></div><span className="text-text-secondary">{formatMessageType(message.message_type)}</span><span className="text-xs text-text-muted">{formatDate(message.created_at)}</span><span><StatusBadge status={formatStatus(message.delivery_status)} tone={getDeliveryTone(message.delivery_status)} /></span></Link>;
}

function LoadingRows() { return <div>{[0, 1, 2, 3, 4].map((row) => <div key={row} className="grid grid-cols-[1.3fr_1fr_160px_120px] gap-4 border-b border-border-subtle px-2 py-5"><span className="skeleton-bone h-3 w-2/3 rounded" /><span className="skeleton-bone h-3 w-1/2 rounded" /><span className="skeleton-bone h-3 w-24 rounded" /><span className="skeleton-bone h-5 w-16 rounded" /></div>)}</div>; }
function formatDate(value: string | null) { return value ? dateFormatter.format(new Date(value)) : "Sin fecha"; }
function formatStatus(value: string | null) { return (value ?? "pendiente").replaceAll("_", " "); }
function formatMessageType(value: string) { return value.replaceAll("_", " "); }
function getDeliveryTone(status: string | null) { if (status === "failed") return "danger" as const; if (["delivered", "read", "click"].includes(status ?? "")) return "success" as const; return "neutral" as const; }
