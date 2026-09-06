"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { ErrorBoundary } from "@/components/error-boundary";
import { DeliveryBadge, BulkStatusBadge } from "@/components/whatsapp/status-badges";
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

type Message = {
  id: string;
  employee_id: string;
  nombre: string | null;
  apellidos: string | null;
  telefono: string | null;
  delivery_status: string | null;
  error_message: string | null;
  created_at: string | null;
};

type DetailResponse = {
  ok: boolean;
  bulkSend: BulkSend;
  messages: Message[];
  totalPages: number;
  error?: string;
};

const PAGE_SIZE = 50;

const fmtDate = (d: string | null) =>
  d ? new Intl.DateTimeFormat("es-MX", { dateStyle: "short" }).format(new Date(d)) : "-";

export function BulkDetail({ id }: { id: string }) {
  return (
    <ErrorBoundary section="Detalle de envío masivo">
      <BulkDetailInner id={id} />
    </ErrorBoundary>
  );
}

function BulkDetailInner({ id }: { id: string }) {
  const [bulkSend, setBulkSend] = useState<BulkSend | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [searchInput, setSearchInput] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const searchQuery = useDebounce(searchInput, 300);

  const load = useCallback(
    (p: number, sf: string, q: string) => {
      const params = new URLSearchParams({ id, page: String(p), pageSize: String(PAGE_SIZE) });
      if (sf) params.set("status", sf);
      if (q) params.set("q", q);

      return fetch(`/api/whatsapp/bulk/detail?${params}`)
        .then((r) => r.json())
        .then((json: DetailResponse) => {
          if (!json.ok) throw new Error(json.error ?? "Error al cargar detalle.");
          setBulkSend(json.bulkSend);
          setMessages(json.messages);
          setTotalPages(json.totalPages);
        });
    },
    [id],
  );

  useEffect(() => {
    let isCancelled = false;
    Promise.resolve().then(() => {
      if (!isCancelled) {
        setLoading(true);
        setError(null);
      }
    });
    load(page, statusFilter, searchQuery)
      .catch((err: Error) => { if (!isCancelled) setError(err.message); })
      .finally(() => { if (!isCancelled) setLoading(false); });
    return () => { isCancelled = true; };
  }, [load, page, statusFilter, searchQuery]);

  if (error) {
    return (
      <div className="note note-danger py-1 text-sm text-danger">
        <p>{error}</p>
        <button
          onClick={() => {
            setLoading(true);
            setError(null);
            load(page, statusFilter, searchQuery)
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
      {bulkSend && (
        <Card className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-text-primary">Envío masivo</span>
                <BulkStatusBadge status={bulkSend.status} />
              </div>
              <p className="text-xs text-text-muted">{fmtDate(bulkSend.created_at)} · {bulkSend.mode === "import" ? "Importación" : "Manual"}</p>
            </div>
            <Link href="/whatsapp/history" className="text-sm font-medium text-primary hover:underline">
              Volver
            </Link>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Metric label="Elegibles" value={bulkSend.eligible_count ?? 0} />
            <Metric label="Enviados" value={bulkSend.sent_count ?? 0} />
            <Metric label="Fallidos" value={bulkSend.failed_count ?? 0} tone={(bulkSend.failed_count ?? 0) > 0 ? "danger" : "neutral"} />
          </div>
        </Card>
      )}

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Buscar..."
            value={searchInput}
            onChange={(e) => { setSearchInput(e.target.value); setPage(1); }}
            className="h-9 flex-1 min-w-[180px] rounded-lg border border-border bg-background px-3 text-sm text-text-primary outline-none focus:border-primary"
          />
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="h-9 rounded-lg border border-border bg-surface px-2 text-sm text-text-primary outline-none focus:border-primary"
          >
            <option value="">Todos</option>
            <option value="sent">Enviados</option>
            <option value="delivered">Entregados</option>
            <option value="failed">Fallidos</option>
          </select>
        </div>
      </Card>

      <Card className="overflow-hidden p-4">
        <h3 className="text-sm font-medium text-text-muted">Mensajes</h3>
        {loading ? (
          <div className="mt-3 space-y-2">
            {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-10 animate-pulse rounded bg-surface-muted" />)}
          </div>
        ) : messages.length === 0 ? (
          <p className="mt-3 text-sm text-text-muted">
            {statusFilter ? "No hay mensajes con ese estado." : "No hay mensajes registrados."}
          </p>
        ) : (
          <div className="mt-3 min-w-[480px] divide-y divide-border">
            <div className="grid grid-cols-[1fr_120px_100px_100px] items-center gap-4 py-2 text-xs font-medium text-text-muted">
              <span>Empleado</span>
              <span>Teléfono</span>
              <span>Fecha</span>
              <span>Estado</span>
            </div>
            {messages.map((msg) => (
              <div key={msg.id} className="grid grid-cols-[1fr_120px_100px_100px] items-center gap-4 py-3 text-sm">
                <Link href={`/contracts/${msg.employee_id}`} className="font-medium text-primary hover:underline">
                  {[msg.nombre, msg.apellidos].filter(Boolean).join(" ") || "—"}
                </Link>
                <span className="text-text-muted">{msg.telefono ?? "—"}</span>
                <span className="text-text-muted">{fmtDate(msg.created_at)}</span>
                <DeliveryBadge status={msg.delivery_status} />
              </div>
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

function Metric({ label, value, tone }: { label: string; value: number; tone?: "danger" | "neutral" }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3 text-center">
      <p className="text-xs text-text-muted">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${tone === "danger" ? "text-danger" : "text-text-primary"}`}>{value}</p>
    </div>
  );
}
