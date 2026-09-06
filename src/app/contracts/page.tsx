import { ContractControlFilters } from "@/components/contracts/contract-control-filters";
import { ContractControlTable } from "@/components/contracts/contract-control-table";
import { AppShell, PageHeader } from "@/components/layout/app-shell";
import {
  EMPTY_CONTRACT_CONTROL_METRICS,
  getContractControlData,
  parseContractOperationalStatus,
  parsePageParam,
  type ContractControlFilters as ContractFilters,
} from "@/lib/backoffice/contract-control";
import { ContractControlDashboard } from "@/components/contracts/contract-control-dashboard";

export const dynamic = "force-dynamic";

type ContractsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ContractsPage({ searchParams }: ContractsPageProps) {
  const resolvedSearchParams = await searchParams;
  const filters = parseFilters(resolvedSearchParams ?? {});
  const result = await getContractControlResult(filters);

  return (
    <AppShell>
      <PageHeader title="Contratos" />
      {result.setupError ? (
        <section className="note note-danger py-1 text-sm text-danger">
          <p className="font-semibold">No se pudo leer la vista de control de contratos</p>
          <p className="mt-2">{result.setupError}</p>
        </section>
      ) : null}
      <ContractControlDashboard metrics={result.metrics} />
      <ContractControlFilters
        empleadores={result.empleadores}
        filters={filters}
        limit={result.limit}
        total={result.total}
        page={result.page}
        totalPages={result.totalPages}
      />
      <ContractControlTable rows={result.rows} />
    </AppShell>
  );
}

function parseFilters(searchParams: Record<string, string | string[] | undefined>): ContractFilters {
  const q = getSingleSearchParam(searchParams.q)?.trim();
  const empleador = getSingleSearchParam(searchParams.empleador)?.trim();
  const rawStatus = getSingleSearchParam(searchParams.status);
  const rawPage = getSingleSearchParam(searchParams.page);
  return {
    q: q || undefined,
    empleador: empleador || undefined,
    status: parseContractOperationalStatus(rawStatus),
    page: parsePageParam(rawPage),
  };
}

function getSingleSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function getContractControlResult(filters: ContractFilters) {
  try {
    return { ...(await getContractControlData(filters)), setupError: null };
  } catch (error) {
    return {
      rows: [],
      metrics: EMPTY_CONTRACT_CONTROL_METRICS,
      empleadores: [],
      total: 0,
      limit: 50,
      page: 1,
      totalPages: 1,
      setupError: error instanceof Error ? error.message : "No se pudo leer el control de contratos.",
    };
  }
}
