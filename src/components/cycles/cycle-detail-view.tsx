import Link from "next/link";
import { syncCycleStatusesAction } from "@/app/cycles/actions";
import { Card } from "@/components/ui/card";
import { Metric } from "@/components/ui/metric";
import { StatusBadge } from "@/components/ui/status-badge";
import type { StatusTone } from "@/components/ui/status-badge";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { RoleGate } from "@/components/auth/role-gate";
import {
  DataTable,
  DataTableHead,
  DataTableHeaderCell,
  DataTableCell,
  DataTableEmpty,
} from "@/components/ui/data-table";
import type { CycleDetail, CycleEstado } from "@/lib/backoffice/cycles";

const dateFormatter = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" });

function formatDate(value: string | null) {
  if (!value) return "-";
  return dateFormatter.format(new Date(value));
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 }).format(value);
}

const ESTADO_LABEL: Record<CycleEstado, string> = {
  firmado: "Firmó",
  en_proceso: "En proceso",
  sin_contrato: "Sin contrato",
};
const ESTADO_TONE: Record<CycleEstado, StatusTone> = {
  firmado: "success",
  en_proceso: "warning",
  sin_contrato: "neutral",
};

export function CycleDetailView({
  cycle,
  actionFeedback,
}: {
  cycle: CycleDetail;
  actionFeedback?: { tone: StatusTone; message: string };
}) {
  return (
    <div className="flex flex-col gap-6">
      {actionFeedback ? (
        <div className={["rounded-xl border px-4 py-3 text-sm", feedbackClasses(actionFeedback.tone)].join(" ")}>
          {actionFeedback.message}
        </div>
      ) : null}

      <Card className="p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-text-primary">{cycle.label}</h2>
            <p className="text-sm text-text-muted">Importado el {formatDate(cycle.appliedAt)}</p>
          </div>
          <Link className="text-sm font-medium text-text-muted hover:text-text-primary" href="/cycles">
            Volver
          </Link>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <Metric label="Empleados" value={cycle.total} />
          <Metric label="Firmados" value={`${cycle.firmados} / ${cycle.total}`} tone={cycle.firmados > 0 ? "success" : "neutral"} />
          <Metric label="Monto firmado" value={formatMoney(cycle.montoFirmado)} />
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-medium text-text-muted">Acciones</h3>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <form action={syncCycleStatusesAction}>
            <input name="batch_id" type="hidden" value={cycle.batchId} />
            <RoleGate minimum="operaciones" mode="disable">
              <ConfirmSubmitButton confirmMessage="Se consultará EasyLex por cada contrato de este ciclo para detectar quién ya firmó. ¿Continuar?">
                Actualizar estados
              </ConfirmSubmitButton>
            </RoleGate>
          </form>

          <RoleGate minimum="operaciones" mode="hide">
            <a
              className={[
                "inline-flex h-9 items-center justify-center rounded-lg border border-border bg-surface px-4 text-sm font-medium transition",
                cycle.firmados > 0
                  ? "text-text-primary hover:bg-surface-muted"
                  : "cursor-not-allowed text-text-muted opacity-60",
              ].join(" ")}
              href={cycle.firmados > 0 ? `/api/cycles/${cycle.batchId}/export` : undefined}
              aria-disabled={cycle.firmados === 0}
            >
              Exportar firmados (CSV)
            </a>
          </RoleGate>
        </div>
        <p className="mt-3 text-sm text-text-muted">
          &quot;Actualizar estados&quot; pregunta a EasyLex quién firmó y lo marca. &quot;Exportar firmados&quot; baja el
          Excel (nombre + monto) de los que ya firmaron en este ciclo.
        </p>
      </Card>

      <Card className="surface-panel overflow-hidden p-0">
        <DataTable>
          <DataTableHead>
            <tr>
              <DataTableHeaderCell>Empleado</DataTableHeaderCell>
              <DataTableHeaderCell>RFC</DataTableHeaderCell>
              <DataTableHeaderCell>Monto</DataTableHeaderCell>
              <DataTableHeaderCell>Estado</DataTableHeaderCell>
            </tr>
          </DataTableHead>
          <tbody>
            {cycle.employees.length ? (
              cycle.employees.map((e) => (
                <tr key={e.employeeId} className="border-t border-border hover:bg-surface-muted/70">
                  <DataTableCell>
                    <Link href={`/contracts/${e.employeeId}`} className="font-medium text-text-primary hover:underline">
                      {e.nombre}
                    </Link>
                  </DataTableCell>
                  <DataTableCell className="text-text-muted">{e.rfc || "-"}</DataTableCell>
                  <DataTableCell>{formatMoney(e.monto)}</DataTableCell>
                  <DataTableCell>
                    <StatusBadge status={ESTADO_LABEL[e.estado]} tone={ESTADO_TONE[e.estado]} />
                  </DataTableCell>
                </tr>
              ))
            ) : (
              <DataTableEmpty colSpan={4}>Este ciclo no tiene empleados.</DataTableEmpty>
            )}
          </tbody>
        </DataTable>
      </Card>
    </div>
  );
}

function feedbackClasses(tone: StatusTone) {
  if (tone === "success") return "border-green-200 bg-green-50 text-green-900";
  if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-900";
  if (tone === "danger") return "border-red-200 bg-red-50 text-red-900";
  return "border-border bg-surface-muted text-text-primary";
}
