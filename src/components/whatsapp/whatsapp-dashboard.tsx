"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Metric } from "@/components/ui/metric";
import { ErrorBoundary } from "@/components/error-boundary";
import { StatusBadge } from "@/components/ui/status-badge";

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
  message_type: string;
  delivery_status: string | null;
  created_at: string | null;
};

const fmtDate = (d: string | null) =>
  d ? new Intl.DateTimeFormat("es-MX", { dateStyle: "short" }).format(new Date(d)) : "-";

function getDeliveryTone(status: string | null) {
  const s = status ?? "unknown";
  if (s === "failed") return "danger";
  if (["delivered", "read", "click"].includes(s)) return "success";
  return "neutral";
}

function SkeletonCard() {
  return <div className="h-20 animate-pulse rounded-xl bg-surface-muted" />;
}

export function WhatsAppDashboard() {
  return (
    <ErrorBoundary section="WhatsApp Dashboard">
      <WhatsAppDashboardInner />
    </ErrorBoundary>
  );
}

function WhatsAppDashboardInner() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<RecentMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(() => {
    return fetch("/api/whatsapp/stats")
      .then((r) => r.json())
      .then((json) => {
        if (!json.ok) throw new Error(json.error ?? "Error al cargar métricas.");
        setStats(json.stats);
        setRecent(json.recent ?? []);
      });
  }, []);

  useEffect(() => {
    let isCancelled = false;
    Promise.resolve().then(() => {
      if (!isCancelled) {
        setLoading(true);
        setError(null);
      }
    });
    loadStats()
      .catch((err) => { if (!isCancelled) setError(err.message); })
      .finally(() => { if (!isCancelled) setLoading(false); });
    return () => { isCancelled = true; };
  }, [loadStats]);

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <p>{error}</p>
        <button
          onClick={() => {
            setLoading(true);
            setError(null);
            loadStats().catch((err) => setError(err.message)).finally(() => setLoading(false));
          }}
          className="mt-2 text-sm font-medium text-red-600 underline"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {loading ? (
          <><SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard /></>
        ) : (
          <>
            <Metric label="Enviados hoy" value={stats?.sentToday ?? 0} />
            <Metric label="Tasa de entrega" value={`${stats?.deliveryRate ?? 0}%`} />
            <Metric label="Entregados" value={stats?.totalDelivered ?? 0} />
            <Metric label="Errores hoy" value={stats?.errorsToday ?? 0} tone={(stats?.errorsToday ?? 0) > 0 ? "danger" : "neutral"} />
          </>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[
          { href: "/whatsapp/send", label: "Envío masivo" },
          { href: "/whatsapp/history", label: "Historial" },
          { href: "/settings/whatsapp/templates", label: "Templates" },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-xl border border-border bg-surface p-4 text-sm font-medium text-text-primary transition hover:border-primary"
          >
            {item.label}
          </Link>
        ))}
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-text-muted">Actividad reciente</h3>
          <Link href="/whatsapp/history" className="text-sm font-medium text-primary hover:underline">
            Ver historial
          </Link>
        </div>
        <div className="mt-3 divide-y divide-border">
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-8 animate-pulse rounded bg-surface-muted" />
              ))}
            </div>
          ) : recent.length === 0 ? (
            <p className="py-4 text-sm text-text-muted">No hay mensajes enviados todavía.</p>
          ) : (
            recent.map((msg) => (
              <div key={msg.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <span className="text-text-primary">
                  {[msg.nombre, msg.apellidos].filter(Boolean).join(" ") || "—"}
                </span>
                <div className="flex items-center gap-3 text-text-muted">
                  <span>{fmtDate(msg.created_at)}</span>
                  <StatusBadge status={msg.delivery_status || "-"} tone={getDeliveryTone(msg.delivery_status)} />
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
