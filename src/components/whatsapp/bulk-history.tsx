"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui/card";

type BulkSend = {
  id: string;
  mode: string;
  status: string;
  eligible_count: number | null;
  sent_count: number | null;
  failed_count: number | null;
  created_at: string | null;
  import_id: string | null;
};

type HistoryResponse = {
  ok: boolean;
  data: BulkSend[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  error?: string;
};

const PAGE_SIZE = 20;

const fmtDate = (d: string | null) =>
  d
    ? new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date(d))
    : "-";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    completed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    sending: "bg-amber-50 text-amber-700 ring-amber-200",
    failed: "bg-red-50 text-red-700 ring-red-200",
  };
  const labels: Record<string, string> = {
    completed: "Completado",
    sending: "Enviando…",
    failed: "Fallido",
  };
  const cls = map[status] ?? "bg-surface-muted text-text-muted ring-border";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${cls}`}>
      {labels[status] ?? status}
    </span>
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 px-6 py-4">
      <div className="h-4 w-32 animate-pulse rounded bg-surface-muted" />
      <div className="h-4 w-20 animate-pulse rounded bg-surface-muted" />
      <div className="ml-auto flex gap-3">
        <div className="h-4 w-16 animate-pulse rounded bg-surface-muted" />
        <div className="h-5 w-20 animate-pulse rounded-full bg-surface-muted" />
      </div>
    </div>
  );
}

export function BulkHistory() {
  const [data, setData] = useState<BulkSend[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    (p: number, sf: string) => {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({
        page: String(p),
        pageSize: String(PAGE_SIZE),
        ...(sf ? { status: sf } : {}),
      });
      fetch(`/api/whatsapp/bulk/history?${params}`)
        .then((r) => r.json())
        .then((json: HistoryResponse) => {
          if (!json.ok) throw new Error(json.error ?? "Error al cargar historial.");
          setData(json.data);
          setTotal(json.total);
          setTotalPages(json.totalPages);
        })
        .catch((err: Error) => setError(err.message))
        .finally(() => setLoading(false));
    },
    [],
  );

  useEffect(() => {
    load(page, statusFilter);
  }, [load, page, statusFilter]);

  function handleFilter(sf: string) {
    setStatusFilter(sf);
    setPage(1);
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4">
        <p className="font-semibold text-red-800">{error}</p>
        <button
          onClick={() => load(page, statusFilter)}
          className="mt-2 text-sm font-semibold text-red-600 underline"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-text-muted">Filtrar por estado:</span>
        {["", "completed", "sending", "failed"].map((s) => (
          <button
            key={s || "all"}
            onClick={() => handleFilter(s)}
            className={[
              "rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
              statusFilter === s
                ? "bg-primary text-white shadow-sm"
                : "border border-border bg-surface text-text-muted hover:bg-surface-muted",
            ].join(" ")}
          >
            {s === "" ? "Todos" : s === "completed" ? "Completados" : s === "sending" ? "Enviando" : "Fallidos"}
          </button>
        ))}
        {total > 0 && (
          <span className="ml-auto text-xs text-text-muted">
            {total} {total === 1 ? "envío" : "envíos"} en total
          </span>
        )}
      </div>

      {/* Tabla */}
      <Card>
        <CardHeader>
          <h3 className="text-h2 font-semibold text-text-primary">Envíos masivos</h3>
          <p className="text-sm text-text-muted">Lista de todos los envíos masivos realizados</p>
        </CardHeader>
        <CardBody className="p-0">
          {loading ? (
            <div className="divide-y divide-border">
              {[1, 2, 3, 4, 5].map((i) => <SkeletonRow key={i} />)}
            </div>
          ) : data.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <svg
                className="mx-auto mb-3 h-10 w-10 text-text-muted/40"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="font-semibold text-text-muted">
                {statusFilter ? "No hay envíos con ese estado." : "No hay envíos masivos registrados."}
              </p>
              <Link
                href="/whatsapp/send"
                className="mt-3 inline-block text-sm font-semibold text-primary hover:underline"
              >
                Crear primer envío →
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {/* Header row */}
              <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] items-center gap-4 px-6 py-2.5">
                <span className="text-xs font-bold uppercase tracking-wide text-text-muted">Fecha</span>
                <span className="text-xs font-bold uppercase tracking-wide text-text-muted">Modo</span>
                <span className="text-xs font-bold uppercase tracking-wide text-text-muted text-right">Elegibles</span>
                <span className="text-xs font-bold uppercase tracking-wide text-text-muted text-right">Enviados</span>
                <span className="text-xs font-bold uppercase tracking-wide text-text-muted text-right">Fallidos</span>
                <span className="text-xs font-bold uppercase tracking-wide text-text-muted">Estado</span>
              </div>
              {data.map((row) => (
                <Link
                  key={row.id}
                  href={`/whatsapp/bulk/${row.id}`}
                  className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] items-center gap-4 px-6 py-4 transition-colors hover:bg-surface-muted/50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-text-primary">{fmtDate(row.created_at)}</p>
                    <p className="truncate font-mono text-xs text-text-muted">{row.id.slice(0, 8)}…</p>
                  </div>
                  <span className="rounded-md bg-surface-muted px-2 py-0.5 text-xs font-semibold text-text-muted capitalize">
                    {row.mode === "import" ? "Importación" : "Manual"}
                  </span>
                  <span className="text-right text-sm font-medium text-text-primary">
                    {row.eligible_count ?? "-"}
                  </span>
                  <span className="text-right text-sm font-semibold text-emerald-600">
                    {row.sent_count ?? "-"}
                  </span>
                  <span className={`text-right text-sm font-semibold ${(row.failed_count ?? 0) > 0 ? "text-red-600" : "text-text-muted"}`}>
                    {row.failed_count ?? "-"}
                  </span>
                  <StatusBadge status={row.status} />
                </Link>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-text-muted transition hover:bg-surface-muted disabled:opacity-40"
          >
            ← Anterior
          </button>
          <span className="text-sm text-text-muted">
            Página {page} de {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-text-muted transition hover:bg-surface-muted disabled:opacity-40"
          >
            Siguiente →
          </button>
        </div>
      )}
    </div>
  );
}
