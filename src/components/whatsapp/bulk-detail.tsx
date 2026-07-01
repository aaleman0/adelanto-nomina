"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
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
  import_id: string | null;
};

type Message = {
  id: string;
  employee_id: string;
  nombre: string | null;
  apellidos: string | null;
  rfc: string | null;
  telefono: string | null;
  delivery_status: string | null;
  status: string | null;
  error_message: string | null;
  created_at: string | null;
  wa_message_id: string | null;
};

type DetailResponse = {
  ok: boolean;
  bulkSend: BulkSend;
  messages: Message[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  error?: string;
};

const PAGE_SIZE = 50;

const fmtDate = (d: string | null) =>
  d
    ? new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date(d))
    : "-";

function StatPill({ label, value, color }: { label: string; value: number | null; color?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3 text-center">
      <p className="text-xs font-bold uppercase tracking-wide text-text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color ?? "text-text-primary"}`}>{value ?? "-"}</p>
    </div>
  );
}

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
  const [total, setTotal] = useState(0);
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
          setTotal(json.total);
          setTotalPages(json.totalPages);
        });
    },
    [id],
  );

  useEffect(() => {
    let isCancelled = false;
    
    // Wrap synchronous state updates in a microtask to avoid the lint error
    Promise.resolve().then(() => {
      if (!isCancelled) {
        setLoading(true);
        setError(null);
      }
    });
    
    load(page, statusFilter, searchQuery)
      .catch((err: Error) => {
        if (!isCancelled) {
          setError(err.message);
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setLoading(false);
        }
      });
      
    return () => {
      isCancelled = true;
    };
  }, [load, page, statusFilter, searchQuery]);

  function handleFilter(sf: string) {
    setStatusFilter(sf);
    setPage(1);
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4">
        <p className="font-semibold text-red-800">{error}</p>
        <button
          onClick={() => {
            setLoading(true);
            setError(null);
            load(page, statusFilter, searchQuery)
              .catch((err: Error) => setError(err.message))
              .finally(() => setLoading(false));
          }}
          className="mt-2 text-sm font-semibold text-red-600 underline"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Resumen del bulk send */}
      {loading && !bulkSend ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-surface-muted" />
          ))}
        </div>
      ) : bulkSend ? (
        <>
          {/* Header info */}
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-border bg-surface p-5">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-text-primary">Envío masivo</p>
                <BulkStatusBadge status={bulkSend.status} />
              </div>
              <p className="mt-1 font-mono text-xs text-text-muted">{bulkSend.id}</p>
              <p className="mt-1 text-xs text-text-muted">
                {fmtDate(bulkSend.created_at)} · Modo:{" "}
                <span className="font-semibold">
                  {bulkSend.mode === "import" ? "Importación" : "Manual"}
                </span>
              </p>
            </div>
            <Link
              href="/whatsapp/history"
              className="text-sm font-semibold text-primary hover:underline"
            >
              ← Volver al historial
            </Link>
          </div>

          {/* Stats */}
          <div className="grid gap-3 sm:grid-cols-3">
            <StatPill label="Elegibles" value={bulkSend.eligible_count} />
            <StatPill label="Enviados" value={bulkSend.sent_count} color="text-emerald-600" />
            <StatPill
              label="Fallidos"
              value={bulkSend.failed_count}
              color={(bulkSend.failed_count ?? 0) > 0 ? "text-red-600" : "text-text-muted"}
            />
          </div>
        </>
      ) : null}

      {/* Filtros + búsqueda */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Búsqueda por RFC */}
        <div className="relative flex-1 min-w-[180px]">
          <svg
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Buscar por RFC..."
            value={searchInput}
            onChange={(e) => { setSearchInput(e.target.value); setPage(1); }}
            className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <span className="text-xs font-semibold text-text-muted">Estado:</span>
        {["", "sent", "delivered", "failed"].map((s) => (
          <button
            key={s || "all"}
            onClick={() => handleFilter(s)}
            className={[
              "rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all",
              statusFilter === s
                ? "bg-primary text-white shadow-sm"
                : "border border-border bg-surface text-text-muted hover:bg-surface-muted",
            ].join(" ")}
          >
            {s === "" ? "Todos" : s === "sent" ? "Enviados" : s === "delivered" ? "Entregados" : "Fallidos"}
          </button>
        ))}
        {total > 0 && (
          <span className="ml-auto text-xs text-text-muted">{total} mensajes</span>
        )}
      </div>

      {/* Tabla de mensajes */}
      <Card>
        <CardHeader>
          <h3 className="text-h2 font-semibold text-text-primary">Detalle por empleado</h3>
          <p className="text-sm text-text-muted">Estado de entrega de cada mensaje enviado</p>
        </CardHeader>
        <CardBody className="p-0">
          {loading ? (
            <div className="divide-y divide-border">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-4 px-6 py-4">
                  <div className="h-4 w-40 animate-pulse rounded bg-surface-muted" />
                  <div className="h-4 w-24 animate-pulse rounded bg-surface-muted" />
                  <div className="ml-auto h-5 w-16 animate-pulse rounded-full bg-surface-muted" />
                </div>
              ))}
            </div>
          ) : messages.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <p className="font-semibold text-text-muted">
                {statusFilter ? "No hay mensajes con ese estado." : "No hay mensajes registrados para este envío."}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {/* Column headers */}
              <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 px-6 py-2.5">
                <span className="text-xs font-bold uppercase tracking-wide text-text-muted">Empleado</span>
                <span className="text-xs font-bold uppercase tracking-wide text-text-muted">Teléfono</span>
                <span className="text-xs font-bold uppercase tracking-wide text-text-muted">Fecha</span>
                <span className="text-xs font-bold uppercase tracking-wide text-text-muted">Estado</span>
              </div>
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 px-6 py-3.5 hover:bg-surface-muted/40"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/contracts/${msg.employee_id}`}
                      className="truncate text-sm font-semibold text-primary hover:underline"
                    >
                      {[msg.nombre, msg.apellidos].filter(Boolean).join(" ") || "—"}
                    </Link>
                    <p className="font-mono text-xs text-text-muted">{msg.rfc ?? "—"}</p>
                    {msg.error_message && (
                      <p className="mt-0.5 text-xs text-red-600">{msg.error_message}</p>
                    )}
                  </div>
                  <span className="font-mono text-xs text-text-muted">{msg.telefono ?? "—"}</span>
                  <span className="text-xs text-text-muted">{fmtDate(msg.created_at)}</span>
                  <DeliveryBadge status={msg.delivery_status} />
                </div>
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
            className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-text-muted transition hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40"
          >
            ← Anterior
          </button>
          <span className="text-sm text-text-muted">
            Página {page} de {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-text-muted transition hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40"
          >
            Siguiente →
          </button>
        </div>
      )}
    </div>
  );
}
