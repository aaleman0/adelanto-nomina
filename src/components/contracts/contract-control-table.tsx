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
    <Card className="overflow-hidden">
      {/* Desktop table */}
      <div className="hidden lg:block">
        <DataTable className="w-full">
          <DataTableHead>
            <tr>
              <DataTableHeaderCell>Empleado</DataTableHeaderCell>
              <DataTableHeaderCell>Empleador</DataTableHeaderCell>
              <DataTableHeaderCell>Monto</DataTableHeaderCell>
              <DataTableHeaderCell>Estado</DataTableHeaderCell>
              <DataTableHeaderCell>Último movimiento</DataTableHeaderCell>
              <DataTableHeaderCell />
            </tr>
          </DataTableHead>
          <tbody>
            {rows.length > 0 ? (
              rows.map((row) => (
                <tr key={row.employee_id} className="border-t border-border hover:bg-surface-muted/50">
                  <DataTableCell>
                    <div>
                      <p className="font-medium text-text-primary">{row.empleado || "-"}</p>
                      <p className="text-xs text-text-muted">{row.rfc || "-"}</p>
                    </div>
                  </DataTableCell>
                  <DataTableCell className="text-text-muted">{row.empleador || "-"}</DataTableCell>
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
                      className="text-sm font-medium text-primary hover:underline"
                      href={`/contracts/${row.employee_id}`}
                    >
                      Ver
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
            className="rounded-lg border border-border bg-surface p-4 text-sm hover:border-primary"
            href={`/contracts/${row.employee_id}`}
            key={row.employee_id}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-text-primary">{row.empleado || "Empleado sin nombre"}</p>
                <p className="text-text-muted">{row.empleador || "Sin empleador"} · {formatMoney(row.monto_prestamo_autorizado)}</p>
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
