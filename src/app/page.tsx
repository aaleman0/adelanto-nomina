import Link from "next/link";
import { OperationsCockpit } from "@/components/dashboard/operations-cockpit";
import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { LetterWave } from "@/components/ui/letter-wave";
import {
  EMPTY_CONTRACT_CONTROL_METRICS,
  getContractControlData,
  getDashboardKpis,
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
      <OperationsCockpit rows={result.rows} recent={recent} metrics={result.metrics} signed={kpis.firmados} total={kpis.totalElegibles} />
    </AppShell>
  );
}

type RecentActivityRow = {
  employee_id: string;
  empleado: string | null;
  operational_status: string;
  last_movement_at: string | null;
};

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
