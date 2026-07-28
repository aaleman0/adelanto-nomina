import Link from "next/link";
import { OperationsCockpit } from "@/components/dashboard/operations-cockpit";
import { PipelineOverview } from "@/components/dashboard/pipeline-overview";
import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { LetterWave } from "@/components/ui/letter-wave";
import {
  EMPTY_CONTRACT_CONTROL_METRICS,
  getContractControlData,
  getActionQueue,
  getDashboardKpis,
  type ActionQueue,
  type DashboardKpis,
} from "@/lib/backoffice/contract-control";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [result, actionQueue, kpis] = await Promise.all([
    getContractControlResult(),
    getActionQueueResult(),
    getDashboardKpisResult(),
  ]);

  return (
    <AppShell>
      <PageHeader
        title="Operación"
        action={
          <Link
            className="button-contrast inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--color-5)] px-4 text-sm font-semibold transition hover:-translate-y-0.5 hover:bg-[var(--color-4)] hover:shadow-md"
            href="/imports"
          >
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            <LetterWave>Nueva importación</LetterWave>
          </Link>
        }
      />
      {result.setupError ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">Falta configurar Supabase local</p>
          <p className="mt-1 text-amber-700">Configura variables de Supabase para ver datos reales del backoffice.</p>
        </section>
      ) : null}
      <PipelineOverview metrics={result.metrics} signed={kpis.firmados} total={kpis.totalElegibles} />
      <OperationsCockpit rows={actionQueue.rows} total={actionQueue.total} />
    </AppShell>
  );
}

async function getActionQueueResult(): Promise<ActionQueue> {
  try {
    return await getActionQueue();
  } catch {
    return { rows: [], total: 0 };
  }
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
