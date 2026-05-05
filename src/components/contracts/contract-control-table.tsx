import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
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
  dateStyle: "medium",
  timeStyle: "short",
});

export function ContractControlTable({
  rows,
}: {
  rows: ContractControlRow[];
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-h2 font-semibold text-text-primary">
            Control de contratos
          </h2>
          <p className="text-sm text-text-muted">
            Evidencia operativa de mensaje, solicitud, link, firma y tiempos.
          </p>
        </div>
        <p className="text-sm font-semibold text-text-muted">
          {rows.length} registros visibles
        </p>
      </CardHeader>

      <DataTable className="min-w-[1180px]">
        <DataTableHead>
          <tr>
            <DataTableHeaderCell>Empleado</DataTableHeaderCell>
            <DataTableHeaderCell>RFC</DataTableHeaderCell>
            <DataTableHeaderCell>Telefono</DataTableHeaderCell>
            <DataTableHeaderCell>Empleador</DataTableHeaderCell>
            <DataTableHeaderCell>Monto</DataTableHeaderCell>
            <DataTableHeaderCell>Mensaje</DataTableHeaderCell>
            <DataTableHeaderCell>Contrato</DataTableHeaderCell>
            <DataTableHeaderCell>Vence link</DataTableHeaderCell>
            <DataTableHeaderCell>Firmado</DataTableHeaderCell>
            <DataTableHeaderCell>Ultimo movimiento</DataTableHeaderCell>
            <DataTableHeaderCell>Error</DataTableHeaderCell>
            <DataTableHeaderCell>Detalle</DataTableHeaderCell>
          </tr>
        </DataTableHead>
        <tbody>
          {rows.length > 0 ? (
            rows.map((row) => (
              <tr className="border-t border-border/70" key={row.employee_id}>
                <DataTableCell className="font-medium text-text-primary">
                  {row.empleado || "-"}
                </DataTableCell>
                <DataTableCell>{row.rfc || "-"}</DataTableCell>
                <DataTableCell>{row.telefono_normalizado || "-"}</DataTableCell>
                <DataTableCell>{row.empleador || "-"}</DataTableCell>
                <DataTableCell>{formatMoney(row.monto_prestamo_autorizado)}</DataTableCell>
                <DataTableCell>
                  <div className="flex flex-col gap-1">
                    <StatusBadge
                      status={formatStatus(row.message_status)}
                      tone={getMessageStatusTone(row.message_status)}
                    />
                    <span className="text-xs text-text-muted">
                      {formatDate(row.message_sent_at || row.message_clicked_at)}
                    </span>
                  </div>
                </DataTableCell>
                <DataTableCell>
                  <div className="flex flex-col gap-1">
                    <StatusBadge
                      status={formatStatus(row.operational_status)}
                      tone={getOperationalStatusTone(row.operational_status)}
                    />
                    {row.easylex_contract_id ? (
                      <span className="text-xs text-text-muted">
                        {row.easylex_contract_id}
                      </span>
                    ) : null}
                  </div>
                </DataTableCell>
                <DataTableCell>{formatDate(row.link_expires_at)}</DataTableCell>
                <DataTableCell>
                  {formatDate(row.contract_signed_at || row.attempt_signed_at)}
                </DataTableCell>
                <DataTableCell>{formatDate(row.last_movement_at)}</DataTableCell>
                <DataTableCell className="max-w-[240px] text-red-700">
                  {row.message_error ||
                    row.contract_error ||
                    row.attempt_error ||
                    "-"}
                </DataTableCell>
                <DataTableCell>
                  <Link
                    className="inline-flex h-8 items-center rounded-base border border-border px-3 text-sm font-semibold text-text-primary hover:bg-surface-muted"
                    href={`/contracts/${row.employee_id}`}
                  >
                    Ver detalle
                  </Link>
                </DataTableCell>
              </tr>
            ))
          ) : (
            <DataTableEmpty colSpan={12}>
              Todavia no hay empleados/ofertas para control de contratos.
            </DataTableEmpty>
          )}
        </tbody>
      </DataTable>
    </Card>
  );
}

function formatMoney(value: number | null) {
  if (value === null) {
    return "-";
  }

  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return dateFormatter.format(new Date(value));
}

function formatStatus(value: string | null) {
  if (!value) {
    return "pendiente";
  }

  return value.replaceAll("_", " ");
}

function getMessageStatusTone(status: string | null): StatusTone {
  if (status === "error") {
    return "danger";
  }

  if (status === "click" || status === "enviado" || status === "entregado") {
    return "success";
  }

  if (status === "pendiente_envio") {
    return "warning";
  }

  return "neutral";
}

function getOperationalStatusTone(status: string): StatusTone {
  if (status === "error") {
    return "danger";
  }

  if (status === "firmado" || status === "contrato_generado") {
    return "success";
  }

  if (status === "link_expirado" || status === "pendiente_envio") {
    return "warning";
  }

  return "neutral";
}
