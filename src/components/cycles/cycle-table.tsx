import Link from "next/link";
import { Card } from "@/components/ui/card";
import {
  DataTable,
  DataTableHead,
  DataTableHeaderCell,
  DataTableCell,
  DataTableEmpty,
} from "@/components/ui/data-table";
import type { CycleListRow } from "@/lib/backoffice/cycles";

const dateFormatter = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" });

function formatDate(value: string | null) {
  if (!value) return "-";
  return dateFormatter.format(new Date(value));
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(value);
}

export function CycleTable({ rows }: { rows: CycleListRow[] }) {
  return (
    <Card className="surface-panel overflow-hidden p-0">
      <DataTable>
        <DataTableHead>
          <tr>
            <DataTableHeaderCell>Ciclo</DataTableHeaderCell>
            <DataTableHeaderCell>Fecha</DataTableHeaderCell>
            <DataTableHeaderCell>Empleados</DataTableHeaderCell>
            <DataTableHeaderCell>Firmados</DataTableHeaderCell>
            <DataTableHeaderCell>Monto firmado</DataTableHeaderCell>
            <DataTableHeaderCell />
          </tr>
        </DataTableHead>
        <tbody>
          {rows.length ? (
            rows.map((r) => (
              <tr key={r.batchId} className="border-t border-border hover:bg-surface-muted/70">
                <DataTableCell>
                  <span className="font-medium text-text-primary">{r.label}</span>
                </DataTableCell>
                <DataTableCell>{formatDate(r.appliedAt)}</DataTableCell>
                <DataTableCell>{r.total}</DataTableCell>
                <DataTableCell>
                  <span className={r.firmados > 0 ? "font-semibold text-emerald-600" : "text-text-muted"}>
                    {r.firmados} / {r.total}
                  </span>
                </DataTableCell>
                <DataTableCell>{formatMoney(r.montoFirmado)}</DataTableCell>
                <DataTableCell>
                  <Link href={`/cycles/${r.batchId}`} className="text-xs font-semibold text-primary hover:underline">
                    Abrir
                  </Link>
                </DataTableCell>
              </tr>
            ))
          ) : (
            <DataTableEmpty colSpan={6}>Aún no hay ciclos. Importa un lote de empleados para empezar.</DataTableEmpty>
          )}
        </tbody>
      </DataTable>
    </Card>
  );
}
