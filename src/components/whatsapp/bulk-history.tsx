"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { ErrorBoundary } from "@/components/error-boundary";
import { BulkStatusBadge } from "@/components/whatsapp/status-badges";
import { useDebounce } from "@/lib/hooks/use-debounce";

type BulkSend = {
  id: string;
  mode: string;
  status: string;
  eligible_count: number | null;
  sent_count: number | null;
  failed_count: number | null;
  created_at: string | null;
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
  d ? new Intl.DateTimeFormat("es-MX", { dateStyle: "short" }).format(new Date(d)) : "-";

function SkeletonRow() {
  return <div className="h-10 animate-pulse rounded bg-surface-muted" />;
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
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [modeFilter, setModeFilter] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const debouncedDateFrom = useDebounce(dateFrom, 400);
  const debouncedDateTo = useDebounce(dateTo, 400);

  const load = useCallback(
    (p: number, sf: string, mf: string, df: string, dt: string) => {
      const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) });
      if (sf) params.set("status", sf);
      if (mf) params.set("mode", mf);
      if (df) params.set("dateFrom", df);
      if (dt) params.set("dateTo", dt);

      return fetch(`/api/whatsapp/bulk/history?${params}`)
        .then((r) => r.json())
        .then((json: HistoryResponse) => {
          if (!json.ok) throw new Error(json.error ?? "Error al cargar historial.");
          setData(json.data);
          setTotalPages(json.totalPages);
        });
    },
    [],
  );

  useEffect(() => {
    let isCancelled = false;
    Promise.resolve().then(() => {
      if (!isCancelled) {
        setLoading(true);
        setError(null);
      }
    });
    load(page, statusFilter, modeFilter, debouncedDateFrom, debouncedDateTo)
      .catch((err: Error) => { if (!isCancelled) setError(err.message); })
      .finally(() => { if (!isCancelled) setLoading(false); });
    return () => { isCancelled = true; };
  }, [load, page, statusFilter, modeFilter, debouncedDateFrom, debouncedDateTo]);

  function resetFilters() {
    setStatusFilter("");
    setModeFilter("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  }

  const hasFilters = statusFilter || modeFilter || dateFrom || dateTo;

  if (error) {
    return (
      <div className="note note-danger py-1 text-sm text-danger">
        <p>{error}</p>
        <button
          onClick={() => {
            setLoading(true);
            setError(null);
            load(page, statusFilter, modeFilter, debouncedDateFrom, debouncedDateTo)
              .catch((err: Error) => setError(err.message))
              .finally(() => setLoading(false));
          }}
          className="mt-2 text-sm font-medium text-danger underline"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-4">
          <Filter label="Estado">
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="h-9 rounded-lg border border-border bg-surface px-2 text-sm text-text-primary outline-none focus:border-primary"
            >
              <option value="">Todos</option>
              <option value="completed">Completados</option>
              <option value="sending">Enviando</option>
              <option value="failed">Fallidos</option>
            </select>
          </Filter>

          <Filter label="Modo">
            <select
              value={modeFilter}
              onChange={(e) => { setModeFilter(e.target.value); setPage(1); }}
              className="h-9 rounded-lg border border-border bg-surface px-2 text-sm text-text-primary outline-none focus:border-primary"
            >
              <option value="">Todos</option>
              <option value="import">Importación</option>
              <option value="manual">Manual</option>
            </select>
          </Filter>

          <Filter label="Desde">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="h-9 rounded-lg border border-border bg-background px-2 text-sm text-text-primary outline-none focus:border-primary"
            />
          </Filter>

          <Filter label="Hasta">
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className="h-9 rounded-lg border border-border bg-background px-2 text-sm text-text-primary outline-none focus:border-primary"
            />
          </Filter>

          <div className="ml-auto flex items-center gap-3">
            {hasFilters && (
              <button onClick={resetFilters} className="text-sm font-medium text-primary hover:underline">
                Limpiar
              </button>
            )}
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden p-4">
        <h3 className="text-sm font-medium text-text-muted">Envíos masivos</h3>
        {loading ? (
          <div className="mt-3 space-y-2">
            {[1, 2, 3, 4, 5].map((i) => <SkeletonRow key={i} />)}
          </div>
        ) : data.length === 0 ? (
          <div className="mt-3 py-8 text-center">
            <p className="text-sm text-text-muted">
              {statusFilter ? "No hay envíos con ese estado." : "No hay envíos masivos registrados."}
            </p>
            <Link href="/whatsapp/send" className="mt-2 inline-block text-sm font-medium text-primary hover:underline">
              Crear primer envío
            </Link>
          </div>
        ) : (
          <div className="mt-3 min-w-[640px] divide-y divide-border">
            <div className="grid grid-cols-[1fr_100px_80px_80px_80px_100px] items-center gap-4 py-2 text-xs font-medium text-text-muted">
              <span>Fecha</span>
              <span className="text-center">Modo</span>
              <span className="text-center">Elegibles</span>
              <span className="text-center">Enviados</span>
              <span className="text-center">Fallidos</span>
              <span className="text-center">Estado</span>
            </div>
            {data.map((row) => (
              <Link
                key={row.id}
                href={`/whatsapp/bulk/${row.id}`}
                className="grid grid-cols-[1fr_100px_80px_80px_80px_100px] items-center gap-4 py-3 text-sm transition hover:bg-surface-muted/50"
              >
                <div>
                  <p className="text-text-primary">{fmtDate(row.created_at)}</p>
                </div>
                <span className="text-center text-text-muted capitalize">{row.mode === "import" ? "Importación" : "Manual"}</span>
                <span className="text-center text-text-primary">{row.eligible_count ?? "-"}</span>
                <span className="text-center text-success">{row.sent_count ?? "-"}</span>
                <span className={`text-center ${(row.failed_count ?? 0) > 0 ? "text-danger" : "text-text-muted"}`}>
                  {row.failed_count ?? "-"}
                </span>
                <div className="flex justify-center">
                  <BulkStatusBadge status={row.status} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-text-muted transition hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40"
          >
            ← Anterior
          </button>
          <span className="text-sm text-text-muted">Página {page} de {totalPages}</span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-text-muted transition hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40"
          >
            Siguiente →
          </button>
        </div>
      )}
    </div>
  );
}

function Filter({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-text-muted">{label}</label>
      {children}
    </div>
  );
}
