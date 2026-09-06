"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  DataTableCell,
  DataTableEmpty,
  DataTableHead,
  DataTableHeaderCell,
} from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import type { StatusTone } from "@/components/ui/status-badge";
import { useHasRole } from "@/components/auth/role-context";
import type { ContractControlRow } from "@/lib/backoffice/contract-control";

const dateFormatter = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "short",
});

type BulkState =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "done"; sent: number; failed: number }
  | { status: "error"; message: string };

export function ContractControlTable({ rows }: { rows: ContractControlRow[] }) {
  const router = useRouter();
  const canSend = useHasRole("operaciones");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<BulkState>({ status: "idle" });

  // Solo tiene sentido enviar a quien no ha firmado. El "seleccionar todos"
  // opera sobre este subconjunto para no ofrecer acciones imposibles.
  const selectableRows = rows.filter((r) => r.operational_status !== "firmado");
  const allSelected = selectableRows.length > 0 && selectableRows.every((r) => selected.has(r.employee_id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setBulk({ status: "idle" });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(selectableRows.map((r) => r.employee_id)));
    setBulk({ status: "idle" });
  }

  async function sendSelected() {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (!window.confirm(`Se enviará el mensaje de WhatsApp a ${ids.length} empleado${ids.length !== 1 ? "s" : ""} con la plantilla por defecto. ¿Continuar?`)) return;

    setBulk({ status: "sending" });
    try {
      const res = await fetch("/api/whatsapp/bulk?action=send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "manual", employeeIds: ids }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setBulk({ status: "error", message: data.error ?? `Error ${res.status}` });
        return;
      }
      setBulk({ status: "done", sent: data.sent ?? 0, failed: data.failed ?? 0 });
      setSelected(new Set());
      router.refresh();
    } catch (error) {
      setBulk({ status: "error", message: error instanceof Error ? error.message : "Error de red." });
    }
  }

  const selectedCount = selected.size;

  return (
    <Card className="surface-panel flex min-h-[360px] flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-5 py-4"><div><h2 className="font-display text-base font-semibold text-text-primary">Expedientes</h2><p className="text-xs text-text-muted">Abre un registro para revisar contrato, mensajes y evidencia.</p></div><span className="font-data text-xs text-text-muted">{rows.length} visibles</span></div>

      {/* Desktop table */}
      <div className="panel-scroll hidden min-h-0 flex-1 lg:block">
        <DataTable className="w-full">
          <DataTableHead>
            <tr>
              <DataTableHeaderCell>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  disabled={selectableRows.length === 0}
                  aria-label="Seleccionar todos"
                  className="h-4 w-4 cursor-pointer accent-[var(--color-5)]"
                />
              </DataTableHeaderCell>
              <DataTableHeaderCell>Empleado</DataTableHeaderCell>
              <DataTableHeaderCell>Contacto</DataTableHeaderCell>
              <DataTableHeaderCell>Monto</DataTableHeaderCell>
              <DataTableHeaderCell>Estado</DataTableHeaderCell>
              <DataTableHeaderCell>Último movimiento</DataTableHeaderCell>
              <DataTableHeaderCell />
            </tr>
          </DataTableHead>
          <tbody>
            {rows.length > 0 ? (
              rows.map((row) => {
                const seleccionable = row.operational_status !== "firmado";
                const marcado = selected.has(row.employee_id);
                return (
                <tr key={row.employee_id} className={`border-l-2 border-t border-border transition hover:bg-surface-muted/70 ${marcado ? "bg-primary-light/40" : ""} ${getPriorityBorder(row.operational_status)}`}>
                  <DataTableCell>
                    <input
                      type="checkbox"
                      checked={marcado}
                      onChange={() => toggle(row.employee_id)}
                      disabled={!seleccionable}
                      aria-label={`Seleccionar ${row.empleado ?? "empleado"}`}
                      className="h-4 w-4 cursor-pointer accent-[var(--color-5)] disabled:cursor-not-allowed disabled:opacity-30"
                    />
                  </DataTableCell>
                  <DataTableCell>
                    <div>
                      <p className="font-semibold text-text-primary">{row.empleado || "Empleado sin nombre"}</p>
                      <p className="text-xs text-text-muted">{row.empleador || "Sin empleador"}</p>
                    </div>
                  </DataTableCell>
                  <DataTableCell><p className="text-sm text-text-secondary">{row.telefono_normalizado || "Sin teléfono"}</p><p className="font-data text-xs text-text-muted">{row.rfc || "Sin RFC"}</p></DataTableCell>
                  <DataTableCell className="font-medium text-text-primary">{formatMoney(row.monto_prestamo_autorizado)}</DataTableCell>
                  <DataTableCell>
                    <StatusBadge
                      status={formatStatus(row.operational_status)}
                      tone={getOperationalStatusTone(row.operational_status)}
                    />
                  </DataTableCell>
                  <DataTableCell className="text-sm text-text-muted">
                    {formatDate(row.last_movement_at)}
                  </DataTableCell>
                  <DataTableCell>
                    <Link
                      className="inline-flex h-8 items-center rounded-lg border border-primary-border bg-primary-light px-3 text-xs font-semibold text-primary transition hover:border-primary hover:bg-surface hover:text-primary-hover"
                      href={`/contracts/${row.employee_id}`}
                    >
                      Abrir expediente
                    </Link>
                  </DataTableCell>
                </tr>
                );
              })
            ) : (
              <DataTableEmpty colSpan={7}>
                Sin contratos para mostrar.
              </DataTableEmpty>
            )}
          </tbody>
        </DataTable>
      </div>

      {/* Mobile cards */}
      <div className="grid gap-3 p-4 lg:hidden">
        {rows.length > 0 ? rows.map((row) => (
          <Link
            className={`rounded-lg border border-border border-l-4 bg-surface p-4 text-sm transition hover:border-primary ${getPriorityBorder(row.operational_status)}`}
            href={`/contracts/${row.employee_id}`}
            key={row.employee_id}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-text-primary">{row.empleado || "Empleado sin nombre"}</p>
                <p className="text-text-muted">{row.empleador || "Sin empleador"}</p><p className="font-data mt-2 font-medium text-text-primary">{formatMoney(row.monto_prestamo_autorizado)}</p>
              </div>
              <StatusBadge status={formatStatus(row.operational_status)} tone={getOperationalStatusTone(row.operational_status)} />
            </div>
          </Link>
        )) : (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-text-muted">
            Sin contratos para mostrar.
          </p>
        )}
      </div>

      {/* Barra de acción en lote: aparece al seleccionar */}
      {selectedCount > 0 && (
        <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-text-primary">{selectedCount} seleccionado{selectedCount !== 1 ? "s" : ""}</span>
            <button type="button" onClick={() => setSelected(new Set())} className="text-xs text-text-muted underline hover:text-text-primary">Limpiar</button>
            {bulk.status === "done" && (
              <span className={["text-xs", bulk.sent > 0 ? "text-success" : "text-warning"].join(" ")}>
                {bulk.sent > 0 ? `Enviado a ${bulk.sent}${bulk.failed > 0 ? ` · ${bulk.failed} con error` : ""}.` : "No se pudo enviar."}
              </span>
            )}
            {bulk.status === "error" && <span className="text-xs text-danger">{bulk.message}</span>}
          </div>
          <Button
            onClick={sendSelected}
            disabled={bulk.status === "sending" || !canSend}
            title={canSend ? undefined : "Requiere rol operaciones."}
          >
            {bulk.status === "sending" ? "Enviando…" : `Enviar WhatsApp a ${selectedCount}`}
          </Button>
        </div>
      )}
    </Card>
  );
}

function formatMoney(value: number | null) {
  if (value === null) return "-";
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return dateFormatter.format(new Date(value));
}

function formatStatus(value: string | null) {
  if (!value) return "pendiente";
  return value.replaceAll("_", " ");
}

function getOperationalStatusTone(status: string): StatusTone {
  if (status === "error") return "danger";
  if (status === "firmado" || status === "contrato_generado") return "success";
  if (status === "link_expirado" || status === "pendiente_envio") return "warning";
  return "neutral";
}

function getPriorityBorder(status: string) {
  if (status === "error") return "border-l-danger";
  if (status === "link_expirado" || status === "pendiente_envio") return "border-l-warning";
  if (status === "firmado" || status === "contrato_generado") return "border-l-success";
  return "border-l-[var(--color-3)]";
}
