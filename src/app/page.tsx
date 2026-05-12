import Link from "next/link";
import { ContractControlDashboard } from "@/components/contracts/contract-control-dashboard";
import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { EMPTY_CONTRACT_CONTROL_METRICS, getContractControlData, type ContractControlRow } from "@/lib/backoffice/contract-control";

export const dynamic = "force-dynamic";

export default async function Home() {
  const result = await getContractControlResult();
  const attention = result.rows.filter((row) => ["error", "link_expirado", "contrato_en_proceso"].includes(row.operational_status)).slice(0, 6);
  const recent = result.rows.slice(0, 6);

  return (
    <AppShell>
      <PageHeader
        title="Dashboard operativo"
        description="Resumen ejecutivo de adelantos: prioridades, contratos y accesos rápidos para operación diaria."
        action={<Link className="inline-flex h-10 items-center rounded-base bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary-strong" href="/imports">Nueva importación</Link>}
      />
      {result.setupError ? (
        <section className="rounded-base border border-link bg-link/20 p-5 text-sm text-text-primary">
          <p className="font-semibold">Falta configurar Supabase local</p>
          <p className="mt-2">Configura variables de Supabase para ver datos reales del backoffice.</p>
        </section>
      ) : null}
      <ContractControlDashboard metrics={result.metrics} />
      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <AttentionCard rows={attention} />
        <QuickActions />
      </section>
      <RecentActivity rows={recent} />
    </AppShell>
  );
}

function AttentionCard({ rows }: { rows: ContractControlRow[] }) {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-h2 font-semibold text-text-primary">Atención requerida</h2>
        <p className="mt-1 text-sm text-text-muted">Errores, links expirados y contratos que podrían necesitar seguimiento.</p>
      </CardHeader>
      <CardBody className="space-y-3">
        {rows.length > 0 ? rows.map((row) => (
          <Link className="block rounded-base border border-border bg-surface px-4 py-3 transition hover:border-primary hover:shadow-sm" href={`/contracts/${row.employee_id}`} key={row.employee_id}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-text-primary">{row.empleado || "Empleado sin nombre"}</p>
                <p className="text-sm text-text-muted">{row.rfc || "Sin RFC"} · {row.empleador || "Sin empleador"}</p>
              </div>
              <StatusBadge status={formatStatus(row.operational_status)} tone={row.operational_status === "error" ? "danger" : "warning"} />
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

function RecentActivity({ rows }: { rows: ContractControlRow[] }) {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-h2 font-semibold text-text-primary">Actividad reciente</h2>
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

function formatStatus(value: string) {
  return value.replaceAll("_", " ");
}

function formatDate(value: string | null) {
  if (!value) return "Sin fecha";
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
