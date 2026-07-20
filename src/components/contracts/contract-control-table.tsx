import Link from "next/link";
import { Card } from "@/components/ui/card";
import {
  DataTable,
  DataTableCell,
  DataTableEmpty,
  DataTableHead,
  DataTableHeaderCell,
} from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import type { StatusTone } from "@/components/ui/status-badge";
import type { ContractControlRow } from "@/lib/backoffice/contract-control";

const dateFormatter = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "short",
});

export function ContractControlTable({ rows }: { rows: ContractControlRow[] }) {
  return (
    <Card className="surface-panel flex min-h-[360px] flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-5 py-4"><div><h2 className="font-display text-base font-semibold text-text-primary">Expedientes</h2><p className="text-xs text-text-muted">Abre un registro para revisar contrato, mensajes y evidencia.</p></div><span className="font-data text-xs text-text-muted">{rows.length} visibles</span></div>
      {/* Desktop table */}
      <div className="panel-scroll hidden min-h-0 flex-1 lg:block">
        <DataTable className="w-full">
          <DataTableHead>
            <tr>
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
              rows.map((row) => (
                <tr key={row.employee_id} className={`border-l-2 border-t border-border transition hover:bg-surface-muted/70 ${getPriorityBorder(row.operational_status)}`}>
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
                      className="inline-flex h-8 items-center rounded-lg border border-primary-border bg-primary-light px-3 text-xs font-semibold text-primary transition hover:border-primary hover:bg-white hover:text-primary-hover"
                      href={`/contracts/${row.employee_id}`}
                    >
                      Abrir expediente
                    </Link>
                  </DataTableCell>
                </tr>
              ))
            ) : (
              <DataTableEmpty colSpan={6}>
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
            className={`rounded-lg border border-border border-l-4 bg-surface p-4 text-sm transition hover:-translate-y-0.5 hover:border-primary hover:shadow-sm ${getPriorityBorder(row.operational_status)}`}
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
