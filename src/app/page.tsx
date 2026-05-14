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

  // Casos de atención: ordenados de mayor a menor monto para priorizar por impacto
  const attention = result.rows
    .filter((row) => ["error", "link_expirado", "contrato_en_proceso"].includes(row.operational_status))
    .sort((a, b) => (b.monto_prestamo_autorizado ?? 0) - (a.monto_prestamo_autorizado ?? 0))
    .slice(0, 6);

  return (
    <AppShell>
      <PageHeader
        title="Dashboard operativo"
        description="Resumen ejecutivo de adelantos: prioridades, contratos y accesos rápidos para operación diaria."
        action={<Link className="inline-flex h-10 items-center rounded-base border border-border px-4 text-sm font-semibold text-text-primary transition hover:bg-surface-muted" href="/imports">Nueva importación</Link>}
      />
      {result.setupError ? (
        <section className="rounded-base border border-link bg-link/20 p-5 text-sm text-text-primary">
          <p className="font-semibold">Falta configurar Supabase local</p>
          <p className="mt-2">Configura variables de Supabase para ver datos reales del backoffice.</p>
        </section>
      ) : null}
      <FunnelProgress firmados={kpis.firmados} totalElegibles={kpis.totalElegibles} />
      <ContractControlDashboard metrics={result.metrics} />
      <ExpiringLinksAlert rows={kpis.expiringLinks} />
      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <AttentionCard rows={attention} />
        <QuickActions />
      </section>
      <RecentActivity rows={recent} />
    </AppShell>
  );
}

function FunnelProgress({ firmados, totalElegibles }: { firmados: number; totalElegibles: number }) {
  const pct = totalElegibles > 0 ? Math.round((firmados / totalElegibles) * 100) : 0;
  const pendientes = totalElegibles - firmados;

  return (
    <Card>
      <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-8">
        <div className="shrink-0 text-center sm:text-left">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Progreso del programa</p>
          <p className="mt-1 text-4xl font-semibold text-text-primary">{pct}<span className="text-xl text-text-muted">%</span></p>
          <p className="mt-1 text-sm text-text-muted">
            <span className="font-semibold text-text-primary">{firmados}</span> firmados de{" "}
            <span className="font-semibold text-text-primary">{totalElegibles}</span> elegibles
          </p>
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <div className="h-3 w-full overflow-hidden rounded-full bg-surface-muted border border-border">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-text-muted">
            <span><span className="font-semibold text-primary">{firmados}</span> firmados</span>
            <span><span className="font-semibold text-amber-700">{pendientes}</span> pendientes de firma</span>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

function ExpiringLinksAlert({ rows }: { rows: DashboardKpis["expiringLinks"] }) {
  if (rows.length === 0) return null;

  return (
    <Card className="border-amber-300 bg-amber-50">
      <CardHeader>
        <div className="flex items-center gap-2">
          <span className="text-amber-600">⚠</span>
          <h2 className="text-h2 font-semibold text-amber-900">
            {rows.length === 1
              ? "1 link expira en las próximas 24 horas"
              : `${rows.length} links expiran en las próximas 24 horas`}
          </h2>
        </div>
        <p className="mt-1 text-sm text-amber-700">
          Regenera estos links ahora para no perder el avance del empleado.
        </p>
      </CardHeader>
      <CardBody className="space-y-2">
        {rows.map((row) => (
          <Link
            className="flex flex-col gap-2 rounded-base border border-amber-200 bg-white px-4 py-3 transition hover:border-amber-400 hover:shadow-sm sm:flex-row sm:items-center sm:justify-between"
            href={`/contracts/${row.employee_id}`}
            key={row.employee_id}
          >
            <div>
              <p className="font-semibold text-text-primary">{row.empleado || "Empleado sin nombre"}</p>
              <p className="text-sm text-text-muted">{row.empleador || "Sin empleador"} · {formatMoney(row.monto_prestamo_autorizado)}</p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-sm font-semibold text-amber-700">
                Vence {formatDate(row.link_expires_at)}
              </span>
              <span className="inline-flex h-7 items-center rounded-base border border-amber-300 bg-amber-100 px-3 text-xs font-semibold text-amber-800">
                Ver y regenerar →
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
        <h2 className="text-h2 font-semibold text-text-primary">Atención requerida</h2>
        <p className="mt-1 text-sm text-text-muted">Ordenados por monto — ataca primero el de mayor impacto.</p>
      </CardHeader>
      <CardBody className="space-y-3">
        {rows.length > 0 ? rows.map((row) => (
          <Link className="block rounded-base border border-border bg-surface px-4 py-3 transition hover:border-primary hover:shadow-sm" href={`/contracts/${row.employee_id}`} key={row.employee_id}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-text-primary">{row.empleado || "Empleado sin nombre"}</p>
                <p className="text-sm text-text-muted">{row.rfc || "Sin RFC"} · {row.empleador || "Sin empleador"}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm font-semibold text-text-primary">{formatMoney(row.monto_prestamo_autorizado)}</span>
                <StatusBadge status={formatStatus(row.operational_status)} tone={row.operational_status === "error" ? "danger" : "warning"} />
              </div>
            </div>
          </Link>
        )) : <p className="rounded-base border border-border bg-surface-muted p-5 text-sm text-text-muted">Sin asuntos críticos visibles en este momento.</p>}
      </CardBody>
    </Card>
  );
}

function QuickActions() {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-h2 font-semibold text-text-primary">Accesos rápidos</h2>
      </CardHeader>
      <CardBody className="grid gap-3">
        <Link className="rounded-base border border-border bg-surface-muted px-4 py-4 font-semibold text-text-primary transition hover:border-primary hover:bg-primary/5" href="/imports">Importar empleados y ofertas</Link>
        <Link className="rounded-base border border-border bg-surface-muted px-4 py-4 font-semibold text-text-primary transition hover:border-primary hover:bg-primary/5" href="/contracts">Ver control de contratos</Link>
        <Link className="rounded-base border border-border bg-surface-muted px-4 py-4 font-semibold text-text-primary transition hover:border-primary hover:bg-primary/5" href="/employees">Empleados / ofertas</Link>
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
        <h2 className="text-h2 font-semibold text-text-primary">Actividad reciente</h2>
        <p className="mt-1 text-sm text-text-muted">Últimos 6 movimientos de toda la base de datos.</p>
      </CardHeader>
      <CardBody className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.length > 0 ? rows.map((row) => (
          <Link className="rounded-base border border-border p-4 transition hover:bg-surface-muted" href={`/contracts/${row.employee_id}`} key={row.employee_id}>
            <p className="font-semibold text-text-primary">{row.empleado || "Empleado sin nombre"}</p>
            <p className="mt-1 text-sm text-text-muted">Último movimiento: {formatDate(row.last_movement_at)}</p>
            <div className="mt-3"><StatusBadge status={formatStatus(row.operational_status)} tone="neutral" /></div>
          </Link>
        )) : <p className="text-sm text-text-muted">Sin actividad para mostrar.</p>}
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
