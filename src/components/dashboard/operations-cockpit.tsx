"use client";

import Link from "next/link";
import { useDeferredValue, useState } from "react";
import type { ContractControlRow, ContractControlMetric } from "@/lib/backoffice/contract-control";
import { SendWhatsAppButton } from "@/components/whatsapp/send-whatsapp-button";

type Activity = { employee_id: string; empleado: string | null; operational_status: string; last_movement_at: string | null };

export function OperationsCockpit({ rows, recent, metrics, signed, total }: { rows: ContractControlRow[]; recent: Activity[]; metrics: ContractControlMetric[]; signed: number; total: number }) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase("es"));
  const queue = rows.length > 0 ? rows : recent.map((item) => ({ ...item, empleador: null, monto_prestamo_autorizado: null } as ContractControlRow));
  const filtered = queue.filter((row) => [row.empleado, row.empleador, row.operational_status].some((value) => value?.toLocaleLowerCase("es").includes(deferredQuery)));
  const [selectedId, setSelectedId] = useState(queue[0]?.employee_id ?? "");
  const selected = queue.find((row) => row.employee_id === selectedId) ?? filtered[0] ?? queue[0];
  const progress = total > 0 ? Math.min(100, Math.round((signed / total) * 100)) : 0;
  const errors = metrics.find((metric) => metric.key === "errors")?.value ?? 0;
  const pending = metrics.find((metric) => metric.key === "pendingSend")?.value ?? 0;

  return (
    <section className="grid flex-1 gap-3 xl:min-h-0 xl:grid-cols-[200px_minmax(420px,1fr)_320px]">
      <aside className="surface-panel flex min-h-0 flex-col rounded-xl p-4">
        <p className="font-data text-[10px] uppercase tracking-[.16em] text-text-muted">Estado de operación</p>
        <div className="mt-5 space-y-5">
          <Signal tone={errors > 0 ? "danger" : "success"} label="Incidencias" value={errors} />
          <Signal tone={pending > 0 ? "warning" : "success"} label="Por contactar" value={pending} />
          <Signal tone="success" label="Firmados" value={signed} />
        </div>
        <div className="mt-auto pt-7">
          <div className="flex items-end justify-between"><span className="text-xs text-text-muted">Avance</span><strong className="font-data text-xl text-text-primary">{progress}%</strong></div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-alt"><div className="h-full bg-[var(--success)]" style={{ width: `${progress}%` }} /></div>
          <p className="mt-2 text-xs text-text-muted">{signed} de {total} elegibles</p>
        </div>
      </aside>

      <div className="surface-panel flex min-h-0 flex-col rounded-xl xl:overflow-hidden">
        <div className="shrink-0 border-b border-border p-4 sm:p-5">
          <div className="flex items-center justify-between gap-4"><div><h2 className="font-display text-xl font-semibold text-text-primary">Cola operativa</h2><p className="font-data mt-1 text-[10px] uppercase tracking-[.14em] text-text-muted">{filtered.length} registros visibles</p></div><Link href="/contracts" className="text-xs font-semibold text-primary hover:text-primary-hover">Ver todos</Link></div>
          <label className="mt-4 flex h-11 items-center gap-3 rounded-lg border border-border bg-white/55 px-3 transition focus-within:border-[var(--color-3)] focus-within:bg-white">
            <svg className="h-4 w-4 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>
            <input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-text-disabled" placeholder="Buscar empleado, empresa o estado" />
          </label>
        </div>
        <div className="panel-scroll flex-1 divide-y divide-border-subtle max-xl:max-h-[60vh]">
          {filtered.length > 0 ? filtered.map((row) => <QueueRow key={row.employee_id} row={row} selected={row.employee_id === selected?.employee_id} onSelect={() => setSelectedId(row.employee_id)} />) : <div className="grid h-full min-h-40 place-items-center p-6 text-sm text-text-muted">No encontramos coincidencias.</div>}
        </div>
      </div>

      <aside className="surface-panel min-h-[360px] rounded-xl p-5 xl:panel-scroll xl:min-h-0">
        <p className="font-data text-[10px] uppercase tracking-[.16em] text-text-muted">Inspector</p>
        {selected ? <Inspector row={selected} /> : <p className="mt-8 text-sm text-text-muted">Pasa el cursor por un registro para inspeccionarlo.</p>}
      </aside>
    </section>
  );
}

function QueueRow({ row, selected, onSelect }: { row: ContractControlRow; selected: boolean; onSelect: () => void }) {
  const tone = getTone(row.operational_status);
  return <button type="button" onMouseEnter={onSelect} onFocus={onSelect} onClick={onSelect} className={`interactive-row grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 border-l-2 px-4 py-4 text-left ${selected ? "border-l-[var(--color-3)] bg-[rgba(212,225,232,.52)]" : "border-l-transparent"}`}><span className={`h-2 w-2 rounded-full ${tone.dot}`} /><span className="min-w-0"><strong className="block truncate text-sm font-semibold text-text-primary">{row.empleado || "Empleado sin nombre"}</strong><span className="mt-0.5 block truncate text-xs text-text-muted">{row.empleador || formatStatus(row.operational_status)}</span></span><span className="font-data text-xs font-medium text-text-secondary">{formatMoney(row.monto_prestamo_autorizado)}</span></button>;
}

function Inspector({ row }: { row: ContractControlRow }) {
  const tone = getTone(row.operational_status);
  return <div className="mt-6 animate-fade-up" key={row.employee_id}><div className="flex items-center justify-between gap-3"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${tone.badge}`}>{formatStatus(row.operational_status)}</span><span className={`h-2.5 w-2.5 rounded-full ${tone.dot}`} /></div><h3 className="font-display mt-6 text-2xl font-semibold leading-tight text-text-primary">{row.empleado || "Empleado sin nombre"}</h3><p className="mt-2 text-sm text-text-muted">{row.empleador || "Sin empleador registrado"}</p><div className="my-6 border-y border-border py-5"><p className="text-xs text-text-muted">Monto autorizado</p><p className="font-data mt-1 text-3xl font-medium text-text-primary">{formatMoney(row.monto_prestamo_autorizado)}</p></div><dl className="space-y-4"><Detail label="Estado" value={formatStatus(row.operational_status)} /><Detail label="Identificador" value={row.employee_id.slice(0, 12)} mono /></dl><div className="mt-7 flex flex-col gap-2">{row.operational_status !== "firmado" && <SendWhatsAppButton employeeId={row.employee_id} employeeName={row.empleado} className="w-full justify-center" />}<Link href={`/contracts/${row.employee_id}`} className="button-contrast flex h-10 items-center justify-center rounded-lg bg-[var(--color-5)] text-sm font-semibold transition hover:-translate-y-0.5 hover:bg-[var(--color-4)]">Abrir expediente</Link></div></div>;
}

function Signal({ tone, label, value }: { tone: "success" | "warning" | "danger"; label: string; value: number }) { const colors = { success: "bg-[var(--success)]", warning: "bg-[var(--warning)]", danger: "bg-[var(--danger)]" }; return <div className="flex items-center gap-3"><span className={`h-2.5 w-2.5 rounded-full shadow-[0_0_0_4px_rgba(167,190,216,.25)] ${colors[tone]}`} /><div><p className="font-data text-xl font-semibold text-text-primary">{value}</p><p className="text-xs text-text-muted">{label}</p></div></div>; }
function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) { return <div><dt className="text-[10px] uppercase tracking-wider text-text-muted">{label}</dt><dd className={`mt-1 text-sm text-text-primary ${mono ? "font-data" : ""}`}>{value}</dd></div>; }
function getTone(status: string) { if (status.includes("error")) return { dot: "bg-[var(--danger)]", badge: "bg-danger-bg text-danger" }; if (status.includes("firmado") || status.includes("generado")) return { dot: "bg-[var(--success)]", badge: "bg-success-bg text-success" }; return { dot: "bg-[var(--warning)]", badge: "bg-warning-bg text-warning" }; }
function formatStatus(value: string) { return value.replaceAll("_", " "); }
function formatMoney(value: number | null) { return value === null ? "—" : new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(value); }
