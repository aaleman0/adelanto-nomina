"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ContractControlRow } from "@/lib/backoffice/contract-control";
import { SendWhatsAppButton } from "@/components/whatsapp/send-whatsapp-button";
import { RoleGate } from "@/components/auth/role-gate";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { regenerateContractLinkAction, retryContractFlowAction } from "@/app/contracts/actions";

export function OperationsCockpit({ rows }: { rows: ContractControlRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase("es"));
  // El cockpit muestra solo lo que requiere acción del operador (lo trae ya
  // filtrado el servidor). El archivo completo y buscable vive en /contracts.
  const queue = rows;
  const filtered = queue.filter((row) => [row.empleado, row.empleador, row.operational_status].some((value) => value?.toLocaleLowerCase("es").includes(deferredQuery)));
  const [selectedId, setSelectedId] = useState(queue[0]?.employee_id ?? "");
  const selected = queue.find((row) => row.employee_id === selectedId) ?? filtered[0] ?? queue[0];

  const searchRef = useRef<HTMLInputElement>(null);
  const selectedRowRef = useRef<HTMLButtonElement>(null);

  // Navegación por teclado: la herramienta se usa todo el día, así que operarla
  // sin ratón multiplica la velocidad. j/k (o flechas) mueven la selección,
  // Enter abre el expediente, s envía WhatsApp, / enfoca el buscador.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const active = document.activeElement as HTMLElement | null;
      const typing =
        !!active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable);

      if (event.key === "/" && !typing) {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (typing) {
        if (event.key === "Escape") active?.blur();
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const index = filtered.findIndex((row) => row.employee_id === selected?.employee_id);

      if (event.key === "j" || event.key === "ArrowDown") {
        event.preventDefault();
        const next = filtered[Math.min(filtered.length - 1, index + 1)];
        if (next) setSelectedId(next.employee_id);
      } else if (event.key === "k" || event.key === "ArrowUp") {
        event.preventDefault();
        const prev = filtered[Math.max(0, index - 1)];
        if (prev) setSelectedId(prev.employee_id);
      } else if (event.key === "Enter") {
        if (selected) router.push(`/contracts/${selected.employee_id}`);
      } else if (event.key === "s") {
        // Dispara el botón de envío del inspector (autocontenido, con su confirm).
        const btn = document.querySelector<HTMLButtonElement>("[data-cockpit-send] button");
        btn?.click();
      } else if (event.key === "r") {
        // Resuelve el desvío (reintentar/regenerar) sin abrir el expediente.
        const btn = document.querySelector<HTMLButtonElement>("[data-cockpit-resolve] button");
        btn?.click();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtered, selected, router]);

  // Mantener la fila seleccionada a la vista al moverse con el teclado.
  useEffect(() => {
    selectedRowRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  return (
    // El embudo (arriba) lleva el resumen de etapas; aquí el cockpit se queda
    // con lo accionable: la cola de trabajo y el inspector.
    <section className="grid flex-1 gap-3 xl:min-h-0 xl:grid-cols-[minmax(420px,1fr)_340px]">
      <div className="surface-panel flex min-h-0 flex-col rounded-xl xl:overflow-hidden">
        <div className="shrink-0 border-b border-border p-4 sm:p-5">
          <div className="flex items-center justify-between gap-4"><div><h2 className="font-display text-xl font-semibold text-text-primary">Requieren acción</h2><p className="font-data mt-1 text-[10px] uppercase tracking-[.14em] text-text-muted">{filtered.length} por resolver</p></div><Link href="/contracts" className="text-xs font-semibold text-primary hover:text-primary-hover">Ver archivo completo</Link></div>
          <label className="mt-4 flex h-11 items-center gap-3 rounded-lg border border-border bg-white/55 px-3 transition focus-within:border-[var(--color-3)] focus-within:bg-white">
            <svg className="h-4 w-4 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>
            <input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-text-disabled" placeholder="Buscar empleado, empresa o estado" />
            <kbd className="hidden shrink-0 rounded border border-border px-1.5 py-0.5 font-data text-[10px] text-text-muted xl:inline">/</kbd>
          </label>
        </div>
        <div className="panel-scroll flex-1 divide-y divide-border-subtle max-xl:max-h-[60vh]">
          {filtered.length > 0 ? (
            filtered.map((row) => <QueueRow key={row.employee_id} row={row} rowRef={row.employee_id === selected?.employee_id ? selectedRowRef : undefined} selected={row.employee_id === selected?.employee_id} onSelect={() => setSelectedId(row.employee_id)} />)
          ) : queue.length === 0 ? (
            // Cola de acción vacía = todo al día. Es buena noticia, no un error.
            <div className="grid h-full min-h-40 place-items-center p-6 text-center">
              <div>
                <div className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-success-bg text-success"><svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" /></svg></div>
                <p className="mt-3 text-sm font-semibold text-text-primary">Todo al día</p>
                <p className="mt-1 text-xs text-text-muted">No hay expedientes esperando acción. El resto vive en el <Link href="/contracts" className="text-primary hover:underline">archivo completo</Link>.</p>
              </div>
            </div>
          ) : (
            <div className="grid h-full min-h-40 place-items-center p-6 text-sm text-text-muted">Ningún resultado para «{query}».</div>
          )}
        </div>
        {/* Atajos de teclado (solo escritorio, donde el flujo es con teclado). */}
        <div className="hidden shrink-0 items-center gap-3 border-t border-border px-4 py-2.5 font-data text-[10px] text-text-muted xl:flex">
          <ShortcutHint keys="j / k" label="mover" />
          <ShortcutHint keys="Enter" label="abrir" />
          <ShortcutHint keys="s" label="enviar" />
          <ShortcutHint keys="r" label="resolver" />
          <ShortcutHint keys="/" label="buscar" />
        </div>
      </div>

      {/* En xl se estira a la altura de la fila (igual que la cola) y hace scroll
          interno si el contenido no cabe, en vez de sobresalir con `self-start`,
          que dejaba el aside más alto que la cola y desalineaba las tarjetas. */}
      <aside className="panel-scroll surface-panel min-h-[360px] rounded-xl p-5 xl:min-h-0 xl:overflow-y-auto">
        <p className="font-data text-[10px] uppercase tracking-[.16em] text-text-muted">Inspector</p>
        {selected ? <Inspector row={selected} /> : <p className="mt-8 text-sm text-text-muted">Pasa el cursor por un registro para inspeccionarlo.</p>}
      </aside>
    </section>
  );
}

function QueueRow({ row, selected, onSelect, rowRef }: { row: ContractControlRow; selected: boolean; onSelect: () => void; rowRef?: React.Ref<HTMLButtonElement> }) {
  const tone = getTone(row.operational_status);
  const relativo = formatRelative(row.last_movement_at);
  return (
    <button
      ref={rowRef}
      type="button"
      onMouseEnter={onSelect}
      onFocus={onSelect}
      onClick={onSelect}
      className={`interactive-row grid w-full grid-cols-[auto_1fr_auto] items-start gap-3 border-l-2 px-4 py-3.5 text-left ${selected ? "border-l-[var(--color-3)] bg-[rgba(212,225,232,.52)]" : "border-l-transparent"}`}
    >
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${tone.dot}`} />
      <span className="min-w-0">
        <strong className="block truncate text-sm font-semibold text-text-primary">{row.empleado || "Empleado sin nombre"}</strong>
        <span className="mt-1 flex min-w-0 items-center gap-1.5">
          {/* El estado en la propia fila: el operador tría sin abrir el inspector. */}
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone.badge}`}>{formatStatus(row.operational_status)}</span>
          {row.empleador && <span className="truncate text-xs text-text-muted">· {row.empleador}</span>}
        </span>
      </span>
      <span className="shrink-0 text-right">
        {/* text-sm para igualar la altura de línea del nombre: así la hora de la
            segunda línea queda alineada con el pill de estado del lado izquierdo. */}
        <span className="font-data block text-sm font-medium text-text-secondary">{formatMoney(row.monto_prestamo_autorizado)}</span>
        {relativo && <span className="mt-1 block text-[11px] text-text-muted">{relativo}</span>}
      </span>
    </button>
  );
}

function Inspector({ row }: { row: ContractControlRow }) {
  const tone = getTone(row.operational_status);
  const status = row.operational_status;
  const hasRequest = Boolean(row.contract_request_id);

  return (
    <div className="mt-6 animate-fade-up" key={row.employee_id}>
      <div className="flex items-center justify-between gap-3">
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${tone.badge}`}>{formatStatus(status)}</span>
        <span className={`h-2.5 w-2.5 rounded-full ${tone.dot}`} />
      </div>
      <h3 className="font-display mt-6 text-2xl font-semibold leading-tight text-text-primary">{row.empleado || "Empleado sin nombre"}</h3>
      <p className="mt-2 text-sm text-text-muted">{row.empleador || "Sin empleador registrado"}</p>
      <div className="my-6 border-y border-border py-5">
        <p className="text-xs text-text-muted">Monto autorizado</p>
        <p className="font-data mt-1 text-3xl font-medium text-text-primary">{formatMoney(row.monto_prestamo_autorizado)}</p>
      </div>
      <dl className="space-y-4">
        <Detail label="Estado" value={formatStatus(status)} />
        <Detail label="Identificador" value={row.employee_id.slice(0, 12)} mono />
      </dl>

      {/* La acción PRIMARIA depende del estado de la fila: resolver el desvío sin
          salir del cockpit. Antes solo se ofrecía "Enviar WhatsApp", que es la
          acción equivocada para un error o un link vencido. */}
      <div className="mt-7 flex flex-col gap-2">
        {status === "error" && (
          <form action={retryContractFlowAction} data-cockpit-resolve>
            <input type="hidden" name="contract_request_id" value={row.contract_request_id ?? ""} />
            <input type="hidden" name="employee_id" value={row.employee_id} />
            <RoleGate minimum="operaciones" mode="disable">
              <ConfirmSubmitButton
                confirmMessage="Se reintentará el flujo del contrato y quedará evidencia en el timeline. ¿Continuar?"
                disabled={!hasRequest}
                className="w-full justify-center"
              >
                Reintentar flujo
              </ConfirmSubmitButton>
            </RoleGate>
          </form>
        )}

        {status === "link_expirado" && (
          <form action={regenerateContractLinkAction} data-cockpit-resolve>
            <input type="hidden" name="contract_request_id" value={row.contract_request_id ?? ""} />
            <input type="hidden" name="employee_id" value={row.employee_id} />
            <RoleGate minimum="operaciones" mode="disable">
              <ConfirmSubmitButton
                confirmMessage="Se regenerará el link de firma de este contrato. ¿Continuar?"
                disabled={!hasRequest}
                className="w-full justify-center"
              >
                Regenerar link
              </ConfirmSubmitButton>
            </RoleGate>
          </form>
        )}

        {/* Enviar el mensaje inicial: solo cuando esa ES la acción correcta
            (pendiente de contacto), no para desvíos ni firmados. */}
        {status === "pendiente_envio" && (
          <span data-cockpit-send>
            <SendWhatsAppButton employeeId={row.employee_id} employeeName={row.empleado} className="w-full justify-center" />
          </span>
        )}

        <Link href={`/contracts/${row.employee_id}`} className="button-contrast flex h-10 items-center justify-center rounded-lg bg-[var(--color-5)] text-sm font-semibold transition hover:-translate-y-0.5 hover:bg-[var(--color-4)]">Abrir expediente</Link>
      </div>
    </div>
  );
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) { return <div><dt className="text-[10px] uppercase tracking-wider text-text-muted">{label}</dt><dd className={`mt-1 text-sm text-text-primary ${mono ? "font-data" : ""}`}>{value}</dd></div>; }
function getTone(status: string) { if (status.includes("error")) return { dot: "bg-[var(--danger)]", badge: "bg-danger-bg text-danger" }; if (status.includes("firmado") || status.includes("generado")) return { dot: "bg-[var(--success)]", badge: "bg-success-bg text-success" }; return { dot: "bg-[var(--warning)]", badge: "bg-warning-bg text-warning" }; }
function ShortcutHint({ keys, label }: { keys: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <kbd className="rounded border border-border px-1.5 py-0.5 text-[10px] text-text-secondary">{keys}</kbd>
      <span>{label}</span>
    </span>
  );
}

function formatStatus(value: string) { return value.replaceAll("_", " "); }
/**
 * Antigüedad del último movimiento, en formato corto para escanear la cola:
 * "hace 5 min", "hace 3 h", "hace 2 d". Más allá de un mes cae a fecha corta.
 * La granularidad (minutos/horas/días) hace que el render de servidor y el de
 * cliente coincidan, así que no hay desajuste de hidratación.
 */
function formatRelative(value: string | null): string {
  if (!value) return "";
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  if (diffMs < 0) return "ahora";
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `hace ${d} d`;
  return new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short" }).format(then);
}
function formatMoney(value: number | null) { return value === null ? "—" : new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(value); }
