"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ErrorBoundary } from "@/components/error-boundary";
import { useDebounce } from "@/lib/hooks/use-debounce";

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
  return (
    <ErrorBoundary section="Historial de envíos">
      <BulkHistoryInner />
    </ErrorBoundary>
  );
}

function BulkHistoryInner() {
  const [data, setData] = useState<BulkSend[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [modeFilter, setModeFilter] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Debounce de fechas para no hacer peticiones en cada keystroke
  const debouncedDateFrom = useDebounce(dateFrom, 400);
  const debouncedDateTo = useDebounce(dateTo, 400);

  const load = useCallback(
    (p: number, sf: string, mf: string, df: string, dt: string) => {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) });
      if (sf) params.set("status", sf);
      if (mf) params.set("mode", mf);
      if (df) params.set("dateFrom", df);
      if (dt) params.set("dateTo", dt);

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
    load(page, statusFilter, modeFilter, debouncedDateFrom, debouncedDateTo);
  }, [load, page, statusFilter, modeFilter, debouncedDateFrom, debouncedDateTo]);

  function resetFilters() {
    setStatusFilter(""); setModeFilter(""); setDateFrom(""); setDateTo(""); setPage(1);
  }

  const hasFilters = statusFilter || modeFilter || dateFrom || dateTo;

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4">
        <p className="font-semibold text-red-800">{error}</p>
        <button
          onClick={() => load(page, statusFilter, modeFilter, debouncedDateFrom, debouncedDateTo)}
          className="mt-2 text-sm font-semibold text-red-600 underline"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Filtros avanzados */}
      <div className="rounded-2xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-end gap-4">
          {/* Estado */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold uppercase tracking-wide text-text-muted">Estado</label>
            <div className="flex gap-1.5">
              {["", "completed", "sending", "failed"].map((s) => (
                <button
                  key={s || "all"}
                  onClick={() => { setStatusFilter(s); setPage(1); }}
                  className={[
                    "rounded-lg px-2.5 py-1 text-xs font-semibold transition-all",
                    statusFilter === s
                      ? "bg-primary text-white"
                      : "border border-border bg-surface text-text-muted hover:bg-surface-muted",
                  ].join(" ")}
                >
                  {s === "" ? "Todos" : s === "completed" ? "Completados" : s === "sending" ? "Enviando" : "Fallidos"}
                </button>
              ))}
            </div>
          </div>

          {/* Modo */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold uppercase tracking-wide text-text-muted">Modo</label>
            <div className="flex gap-1.5">
              {[["", "Todos"], ["import", "Importación"], ["manual", "Manual"]].map(([val, label]) => (
                <button
                  key={val || "all"}
                  onClick={() => { setModeFilter(val); setPage(1); }}
                  className={[
                    "rounded-lg px-2.5 py-1 text-xs font-semibold transition-all",
                    modeFilter === val
                      ? "bg-primary text-white"
                      : "border border-border bg-surface text-text-muted hover:bg-surface-muted",
                  ].join(" ")}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Rango de fechas */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold uppercase tracking-wide text-text-muted">Desde</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="h-8 rounded-lg border border-border bg-background px-2 text-xs text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold uppercase tracking-wide text-text-muted">Hasta</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className="h-8 rounded-lg border border-border bg-background px-2 text-xs text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* Limpiar + total */}
          <div className="ml-auto flex items-center gap-3">
            {hasFilters && (
              <button
                onClick={resetFilters}
                className="text-xs font-semibold text-primary hover:underline"
              >
                Limpiar filtros
              </button>
            )}
            {total > 0 && (
              <span className="text-xs text-text-muted">
                {total} {total === 1 ? "envío" : "envíos"}
              </span>
            )}
          </div>
        </div>
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
              <div className="grid grid-cols-[minmax(220px,1fr)_110px_86px_86px_86px_116px] items-center gap-4 px-6 py-2.5">
                <span className="text-xs font-bold uppercase tracking-wide text-text-muted">Fecha</span>
                <span className="text-center text-xs font-bold uppercase tracking-wide text-text-muted">Modo</span>
                <span className="text-center text-xs font-bold uppercase tracking-wide text-text-muted">Elegibles</span>
                <span className="text-center text-xs font-bold uppercase tracking-wide text-text-muted">Enviados</span>
                <span className="text-center text-xs font-bold uppercase tracking-wide text-text-muted">Fallidos</span>
                <span className="text-center text-xs font-bold uppercase tracking-wide text-text-muted">Estado</span>
              </div>
              {data.map((row) => (
                <Link
                  key={row.id}
                  href={`/whatsapp/bulk/${row.id}`}
                  className="grid grid-cols-[minmax(220px,1fr)_110px_86px_86px_86px_116px] items-center gap-4 px-6 py-4 transition-colors hover:bg-surface-muted/50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-text-primary">{fmtDate(row.created_at)}</p>
                    <p className="truncate font-mono text-xs text-text-muted">{row.id.slice(0, 8)}…</p>
                  </div>
                  <span className="justify-self-center rounded-md bg-surface-muted px-2 py-0.5 text-xs font-semibold text-text-muted capitalize">
                    {row.mode === "import" ? "Importación" : "Manual"}
                  </span>
                  <span className="text-center text-sm font-medium text-text-primary">
                    {row.eligible_count ?? "-"}
                  </span>
                  <span className="text-center text-sm font-semibold text-emerald-600">
                    {row.sent_count ?? "-"}
                  </span>
                  <span className={`text-center text-sm font-semibold ${(row.failed_count ?? 0) > 0 ? "text-red-600" : "text-text-muted"}`}>
                    {row.failed_count ?? "-"}
                  </span>
                  <div className="justify-self-center">
                    <StatusBadge status={row.status} />
                  </div>
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
