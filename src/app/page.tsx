import Link from "next/link";
import { ContractControlDashboard } from "@/components/contracts/contract-control-dashboard";
import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  EMPTY_CONTRACT_CONTROL_METRICS,
  getContractControlData,
  getDashboardKpis,
  type ContractControlRow,
  type DashboardKpis,
} from "@/lib/backoffice/contract-control";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [result, recent, kpis] = await Promise.all([
    getContractControlResult(),
    getRecentActivityRows(),
    getDashboardKpisResult(),
  ]);

  const attention = result.rows
    .filter((row) => ["error", "link_expirado", "contrato_en_proceso"].includes(row.operational_status))
    .sort((a, b) => (b.monto_prestamo_autorizado ?? 0) - (a.monto_prestamo_autorizado ?? 0))
    .slice(0, 6);

  return (
    <AppShell>
      <PageHeader
        title="Dashboard"
        action={
          <Link
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-white transition hover:bg-primary-hover"
            href="/imports"
          >
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Nueva importación
          </Link>
        }
      />
      {result.setupError ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">Falta configurar Supabase local</p>
          <p className="mt-1 text-amber-700">Configura variables de Supabase para ver datos reales del backoffice.</p>
        </section>
      ) : null}
      <FunnelProgress firmados={kpis.firmados} totalElegibles={kpis.totalElegibles} />
      <ContractControlDashboard metrics={result.metrics} />
      <ExpiringLinksAlert rows={kpis.expiringLinks} />
      <AttentionCard rows={attention} />
      <RecentActivity rows={recent} />
    </AppShell>
  );
}

function FunnelProgress({ firmados, totalElegibles }: { firmados: number; totalElegibles: number }) {
  const pct = totalElegibles > 0 ? Math.round((firmados / totalElegibles) * 100) : 0;
  const pendientes = totalElegibles - firmados;

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-10">
        <div className="shrink-0">
          <p className="text-sm font-medium text-text-muted">Progreso del programa</p>
          <p className="mt-1 text-4xl font-semibold text-text-primary">
            {pct}<span className="text-xl text-text-muted">%</span>
          </p>
          <p className="mt-1 text-sm text-text-muted">
            {firmados} firmados de {totalElegibles} elegibles
          </p>
        </div>

        <div className="flex flex-1 flex-col gap-3">
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>

          <div className="flex gap-4 text-sm">
            <span className="text-text-muted">{firmados} firmados</span>
            <span className="text-text-muted">{pendientes} pendientes</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

function ExpiringLinksAlert({ rows }: { rows: DashboardKpis["expiringLinks"] }) {
  if (rows.length === 0) return null;

  return (
    <Card className="border-amber-200 bg-amber-50">
      <div className="p-4">
        <p className="font-medium text-amber-900">
          {rows.length === 1
            ? "1 link expira en las próximas 24 horas"
            : `${rows.length} links expiran en las próximas 24 horas`}
        </p>
        <ul className="mt-2 divide-y divide-amber-200/60">
          {rows.map((row) => (
            <li key={row.employee_id}>
              <Link
                className="flex items-center justify-between py-2 text-sm"
                href={`/contracts/${row.employee_id}`}
              >
                <span className="text-text-primary">{row.empleado || "Empleado sin nombre"}</span>
                <span className="text-amber-700">Vence {formatDate(row.link_expires_at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

function AttentionCard({ rows }: { rows: ContractControlRow[] }) {
  return (
    <Card className="p-4">
      <h2 className="text-sm font-medium text-text-muted">Atención requerida</h2>
      <div className="mt-3 divide-y divide-border">
        {rows.length > 0 ? rows.map((row) => (
          <Link
            className="flex items-center justify-between py-3 text-sm hover:text-primary"
            href={`/contracts/${row.employee_id}`}
            key={row.employee_id}
          >
            <div>
              <p className="font-medium text-text-primary">{row.empleado || "Empleado sin nombre"}</p>
              <p className="text-text-muted">{row.empleador || "Sin empleador"}</p>
            </div>
            <div className="flex items-center gap-3 text-right">
              <span className="font-medium text-text-primary">{formatMoney(row.monto_prestamo_autorizado)}</span>
              <StatusBadge status={formatStatus(row.operational_status)} tone={row.operational_status === "error" ? "danger" : "warning"} />
            </div>
          </Link>
        )) : (
          <p className="py-3 text-sm text-text-muted">Sin asuntos críticos por el momento.</p>
        )}
      </div>
    </Card>
  );
}

type RecentActivityRow = {
  employee_id: string;
  empleado: string | null;
  operational_status: string;
  last_movement_at: string | null;
};

function RecentActivity({ rows }: { rows: RecentActivityRow[] }) {
  return (
    <Card className="p-4">
      <h2 className="text-sm font-medium text-text-muted">Actividad reciente</h2>
      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.length > 0 ? rows.map((row) => (
          <Link
            className="rounded-lg border border-border bg-surface p-3 text-sm hover:border-primary"
            href={`/contracts/${row.employee_id}`}
            key={row.employee_id}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium text-text-primary truncate">{row.empleado || "Empleado sin nombre"}</p>
                <p className="text-text-muted">{formatDate(row.last_movement_at)}</p>
              </div>
              <svg className="h-4 w-4 text-text-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </div>
            <div className="mt-2">
              <StatusBadge status={formatStatus(row.operational_status)} tone="neutral" />
            </div>
          </Link>
        )) : <p className="text-sm text-text-muted col-span-3">Sin actividad para mostrar.</p>}
      </div>
    </Card>
  );
}

async function getContractControlResult() {
  try {
    return { ...(await getContractControlData()), setupError: null };
  } catch (error) {
    return { rows: [], metrics: EMPTY_CONTRACT_CONTROL_METRICS, empleadores: [], total: 0, limit: 50, setupError: error instanceof Error ? error.message : "No se pudo leer el control de contratos." };
  }
}

async function getDashboardKpisResult(): Promise<DashboardKpis> {
  try {
    return await getDashboardKpis();
  } catch {
    return { totalElegibles: 0, firmados: 0, expiringLinks: [] };
  }
}

async function getRecentActivityRows(): Promise<RecentActivityRow[]> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("backoffice_contract_control_v1")
      .select("employee_id, empleado, operational_status, last_movement_at")
      .not("last_movement_at", "is", null)
      .order("last_movement_at", { ascending: false })
      .limit(6);
    if (error) return [];
    return (data ?? []) as RecentActivityRow[];
  } catch {
    return [];
  }
}

function formatStatus(value: string) {
  return value.replaceAll("_", " ");
}

function formatDate(value: string | null) {
  if (!value) return "Sin fecha";
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatMoney(value: number | null) {
  if (value === null) return "-";
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(value);
}
