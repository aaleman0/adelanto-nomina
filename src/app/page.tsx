import Link from "next/link";
import { ContractControlDashboard } from "@/components/contracts/contract-control-dashboard";
import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
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
        title="Dashboard operativo"
        description="Resumen ejecutivo de adelantos: prioridades, contratos y accesos rápidos para operación diaria."
        action={
          <Link
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 text-sm font-semibold shadow-sm shadow-indigo-200 transition hover:from-indigo-700 hover:to-violet-700 hover:shadow-md w-full sm:w-auto justify-center sm:justify-start"
            style={{ color: '#ffffff' }}
            href="/imports"
          >
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="#ffffff" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            <span style={{ color: '#ffffff' }}>Nueva importación</span>
          </Link>
        }
      />
      {result.setupError ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <div className="flex items-center gap-2">
            <svg className="h-5 w-5 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="font-bold">Falta configurar Supabase local</p>
          </div>
          <p className="mt-1.5 ml-7">Configura variables de Supabase para ver datos reales del backoffice.</p>
        </section>
      ) : null}
      <FunnelProgress firmados={kpis.firmados} totalElegibles={kpis.totalElegibles} />
      <ContractControlDashboard metrics={result.metrics} />
      <ExpiringLinksAlert rows={kpis.expiringLinks} />
      <section className="grid gap-6 lg:grid-cols-1">
        <AttentionCard rows={attention} />
      </section>
      <RecentActivity rows={recent} />
    </AppShell>
  );
}

function FunnelProgress({ firmados, totalElegibles }: { firmados: number; totalElegibles: number }) {
  const pct = totalElegibles > 0 ? Math.round((firmados / totalElegibles) * 100) : 0;
  const pendientes = totalElegibles - firmados;

  return (
    <Card className="overflow-hidden">
      <CardBody className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-10">
        {/* Left: stat */}
        <div className="shrink-0 text-center sm:text-left">
          <p className="inline-flex items-center gap-1.5 rounded-lg bg-primary-light px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            Progreso del programa
          </p>
          <p className="mt-3 text-5xl font-bold tabular-nums tracking-tight text-text-primary leading-none">
            {pct}<span className="text-2xl font-semibold text-text-muted ml-0.5">%</span>
          </p>
          <p className="mt-2 text-[13px] text-text-muted">
            <span className="font-bold text-emerald-600">{firmados}</span> firmados{" "}
            de <span className="font-bold text-text-primary">{totalElegibles}</span> elegibles
          </p>
        </div>

        {/* Right: bar */}
        <div className="flex flex-1 flex-col gap-3">
          {/* Progress bar */}
          <div className="relative h-4 w-full overflow-hidden rounded-full bg-surface-muted border border-border/60">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${pct}%`,
                background: "linear-gradient(90deg, #4f46e5 0%, #7c3aed 50%, #06b6d4 100%)",
                boxShadow: "0 0 8px rgba(79,70,229,0.4)",
              }}
            />
          </div>

          {/* Labels */}
          <div className="flex justify-between text-[12px]">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              <span className="font-bold text-emerald-600">{firmados}</span>
              <span className="text-text-muted">firmados</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
              <span className="font-bold text-amber-600">{pendientes}</span>
              <span className="text-text-muted">pendientes</span>
            </span>
          </div>

          {/* Mini stats row */}
          <div className="mt-1 grid grid-cols-3 gap-3">
            {[
              { label: "Elegibles", value: totalElegibles, color: "text-text-primary" },
              { label: "Firmados", value: firmados, color: "text-emerald-600" },
              { label: "Pendientes", value: pendientes, color: "text-amber-600" },
            ].map((s) => (
              <div key={s.label} className="rounded-xl bg-surface-muted border border-border/50 px-3 py-2 text-center">
                <p className={`text-lg font-bold leading-none ${s.color}`}>{s.value}</p>
                <p className="mt-0.5 text-[10px] text-text-muted">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

function ExpiringLinksAlert({ rows }: { rows: DashboardKpis["expiringLinks"] }) {
  if (rows.length === 0) return null;

  return (
    <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50">
      <CardHeader className="border-b border-amber-200/60">
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-xl bg-amber-100">
            <svg className="h-4 w-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <h2 className="text-[15px] font-bold text-amber-900">
              {rows.length === 1
                ? "1 link expira en las próximas 24 horas"
                : `${rows.length} links expiran en las próximas 24 horas`}
            </h2>
            <p className="text-[12px] text-amber-700 mt-0.5">
              Regenera estos links ahora para no perder el avance del empleado.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardBody className="space-y-2.5">
        {rows.map((row) => (
          <Link
            className="group flex flex-col gap-2 rounded-xl border border-amber-200 bg-white/80 px-4 py-3 transition-all hover:border-amber-400 hover:bg-white hover:shadow-md hover:-translate-y-0.5 sm:flex-row sm:items-center sm:justify-between"
            href={`/contracts/${row.employee_id}`}
            key={row.employee_id}
          >
            <div>
              <p className="font-bold text-text-primary">{row.empleado || "Empleado sin nombre"}</p>
              <p className="text-[12px] text-text-muted">{row.empleador || "Sin empleador"} · {formatMoney(row.monto_prestamo_autorizado)}</p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-[12px] font-bold text-amber-700">
                Vence {formatDate(row.link_expires_at)}
              </span>
              <span className="inline-flex h-7 items-center gap-1 rounded-lg border border-amber-300 bg-amber-100 px-3 text-[11px] font-bold text-amber-800 transition group-hover:bg-amber-200">
                Ver y regenerar
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </span>
            </div>
          </Link>
        ))}
      </CardBody>
    </Card>
  );
}

function AttentionCard({ rows }: { rows: ContractControlRow[] }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-xl bg-red-100">
            <svg className="h-4 w-4 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </div>
          <div>
            <h2 className="text-[15px] font-bold text-text-primary">Atención requerida</h2>
            <p className="text-[12px] text-text-muted mt-0.5">Ordenados por monto — ataca primero el de mayor impacto.</p>
          </div>
        </div>
      </CardHeader>
      <CardBody className="space-y-2.5">
        {rows.length > 0 ? rows.map((row) => (
          <Link
            className="group block rounded-xl border border-border bg-surface px-4 py-3.5 transition-all hover:border-primary hover:shadow-md hover:-translate-y-0.5"
            href={`/contracts/${row.employee_id}`}
            key={row.employee_id}
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-bold text-text-primary group-hover:text-primary transition-colors">
                  {row.empleado || "Empleado sin nombre"}
                </p>
                <p className="text-[12px] text-text-muted">{row.rfc || "Sin RFC"} · {row.empleador || "Sin empleador"}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-[13px] font-bold text-text-primary">{formatMoney(row.monto_prestamo_autorizado)}</span>
                <StatusBadge status={formatStatus(row.operational_status)} tone={row.operational_status === "error" ? "danger" : "warning"} />
              </div>
            </div>
          </Link>
        )) : (
          <div className="flex flex-col items-center rounded-xl border border-dashed border-emerald-200 bg-emerald-50/40 p-6 text-center">
            <svg className="h-8 w-8 text-emerald-500 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-[13px] font-semibold text-emerald-700">Sin asuntos críticos</p>
            <p className="text-[12px] text-emerald-600/80 mt-0.5">Todo está bajo control por el momento.</p>
          </div>
        )}
      </CardBody>
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
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-xl bg-primary-light">
            <svg className="h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h2 className="text-[15px] font-bold text-text-primary">Actividad reciente</h2>
            <p className="text-[12px] text-text-muted mt-0.5">Últimos 6 movimientos de toda la base de datos.</p>
          </div>
        </div>
      </CardHeader>
      <CardBody className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.length > 0 ? rows.map((row) => (
          <Link
            className="group rounded-xl border border-border bg-surface p-4 transition-all hover:border-primary hover:shadow-md hover:-translate-y-0.5"
            href={`/contracts/${row.employee_id}`}
            key={row.employee_id}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-bold text-text-primary text-[13px] truncate group-hover:text-primary transition-colors">
                  {row.empleado || "Empleado sin nombre"}
                </p>
                <p className="mt-0.5 text-[11px] text-text-muted flex items-center gap-1">
                  <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {formatDate(row.last_movement_at)}
                </p>
              </div>
              <svg className="h-4 w-4 text-text-disabled shrink-0 mt-0.5 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </div>
            <div className="mt-3">
              <StatusBadge status={formatStatus(row.operational_status)} tone="neutral" />
            </div>
          </Link>
        )) : <p className="text-[13px] text-text-muted col-span-3">Sin actividad para mostrar.</p>}
      </CardBody>
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
