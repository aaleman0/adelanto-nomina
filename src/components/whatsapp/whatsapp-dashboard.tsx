"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui/card";

type Stats = {
  sentToday: number;
  deliveryRate: number;
  errorsToday: number;
  totalDelivered: number;
};

type RecentMessage = {
  id: string;
  employee_id: string;
  nombre: string | null;
  apellidos: string | null;
  rfc: string | null;
  message_type: string;
  delivery_status: string | null;
  created_at: string | null;
  error_message: string | null;
};

const fmtDate = (d: string | null) =>
  d ? new Intl.DateTimeFormat("es-MX", { dateStyle: "short", timeStyle: "short" }).format(new Date(d)) : "-";

function DeliveryChip({ status }: { status: string | null }) {
  const map: Record<string, string> = {
    sent: "bg-blue-50 text-blue-700 ring-blue-200",
    delivered: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    read: "bg-indigo-50 text-indigo-700 ring-indigo-200",
    failed: "bg-red-50 text-red-700 ring-red-200",
    click: "bg-violet-50 text-violet-700 ring-violet-200",
  };
  const s = status ?? "sent";
  const cls = map[s] ?? "bg-surface-muted text-text-muted ring-border";
  const labels: Record<string, string> = {
    sent: "Enviado", delivered: "Entregado", read: "Leído", failed: "Error", click: "Click",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${cls}`}>
      {labels[s] ?? s}
    </span>
  );
}

function StatCard({
  label, value, sub, color,
}: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-text-muted">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${color ?? "text-text-primary"}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-text-muted">{sub}</p>}
    </div>
  );
}

function SkeletonCard() {
  return <div className="h-24 animate-pulse rounded-2xl bg-surface-muted" />;
}

export function WhatsAppDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<RecentMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/whatsapp/stats")
      .then((r) => r.json())
      .then((json) => {
        if (!json.ok) throw new Error(json.error ?? "Error al cargar métricas.");
        setStats(json.stats);
        setRecent(json.recent ?? []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4">
        <p className="font-semibold text-red-800">{error}</p>
        <button onClick={() => window.location.reload()} className="mt-2 text-sm font-semibold text-red-600 underline">
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Métricas rápidas */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading ? (
          <>
            <SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard />
          </>
        ) : (
          <>
            <StatCard
              label="Enviados hoy"
              value={stats?.sentToday ?? 0}
              sub="mensajes en el día"
              color="text-primary"
            />
            <StatCard
              label="Tasa de entrega"
              value={`${stats?.deliveryRate ?? 0}%`}
              sub="del total enviado"
              color={
                (stats?.deliveryRate ?? 0) >= 80
                  ? "text-emerald-600"
                  : (stats?.deliveryRate ?? 0) >= 50
                    ? "text-amber-600"
                    : "text-red-600"
              }
            />
            <StatCard
              label="Total entregados"
              value={stats?.totalDelivered ?? 0}
              sub="confirmados por Meta"
              color="text-emerald-600"
            />
            <StatCard
              label="Errores hoy"
              value={stats?.errorsToday ?? 0}
              sub="mensajes fallidos"
              color={(stats?.errorsToday ?? 0) > 0 ? "text-red-600" : "text-text-muted"}
            />
          </>
        )}
      </div>

      {/* Accesos rápidos */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[
          { href: "/whatsapp/send", icon: "send", label: "Envío masivo", desc: "Envía contratos a múltiples empleados" },
          { href: "/whatsapp/history", icon: "history", label: "Historial de envíos", desc: "Revisa todos los envíos masivos" },
          { href: "/settings/whatsapp/templates", icon: "template", label: "Templates", desc: "Sincroniza templates de Meta" },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group rounded-2xl border border-border bg-surface p-5 shadow-sm transition-all hover:border-primary hover:shadow-md hover:shadow-primary/10"
          >
            <div className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-primary-light">
              <QuickIcon name={item.icon} />
            </div>
            <p className="font-semibold text-text-primary group-hover:text-primary">{item.label}</p>
            <p className="mt-0.5 text-sm text-text-muted">{item.desc}</p>
          </Link>
        ))}
      </div>

      {/* Actividad reciente */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <div>
            <h3 className="text-h2 font-semibold text-text-primary">Actividad reciente</h3>
            <p className="text-sm text-text-muted">Últimos 20 mensajes enviados vía WhatsApp API</p>
          </div>
          <Link
            href="/whatsapp/history"
            className="text-sm font-semibold text-primary hover:underline"
          >
            Ver historial completo →
          </Link>
        </CardHeader>
        <CardBody className="p-0">
          {loading ? (
            <div className="divide-y divide-border">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-4 px-6 py-4">
                  <div className="h-4 w-1/3 animate-pulse rounded bg-surface-muted" />
                  <div className="h-4 w-1/4 animate-pulse rounded bg-surface-muted" />
                  <div className="ml-auto h-5 w-16 animate-pulse rounded-full bg-surface-muted" />
                </div>
              ))}
            </div>
          ) : recent.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-text-muted">
              No hay mensajes enviados todavía.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {recent.map((msg) => (
                <div key={msg.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 hover:bg-surface-muted/40">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-text-primary text-sm">
                      {[msg.nombre, msg.apellidos].filter(Boolean).join(" ") || "—"}
                    </p>
                    <p className="text-xs text-text-muted font-mono">{msg.rfc ?? "—"}</p>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-text-muted">
                    <span>{msg.message_type}</span>
                    <span>{fmtDate(msg.created_at)}</span>
                    <DeliveryChip status={msg.delivery_status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function QuickIcon({ name }: { name: string }) {
  const cls = "h-5 w-5 text-primary";
  if (name === "send")
    return (
      <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
      </svg>
    );
  if (name === "history")
    return (
      <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );
  return (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}
