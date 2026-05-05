import { ImportUploadForm } from "@/components/imports/import-upload-form";
import { ApplyImportButton } from "@/components/imports/apply-import-button";
import { ContractControlDashboard } from "@/components/contracts/contract-control-dashboard";
import { ContractControlFilters } from "@/components/contracts/contract-control-filters";
import { ContractControlTable } from "@/components/contracts/contract-control-table";
import { AppShell, PageHeader } from "@/components/layout/app-shell";
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
import {
  EMPTY_CONTRACT_CONTROL_METRICS,
  getContractControlData,
  parseContractOperationalStatus,
  type ContractControlFilters as ContractFilters,
} from "@/lib/backoffice/contract-control";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type ImportBatch = {
  id: string;
  filename: string;
  status: string;
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  duplicate_rows: number;
  applied_rows: number;
  changed_rows: number;
  unchanged_rows: number;
  created_at: string;
};

type HomeProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Home({ searchParams }: HomeProps) {
  const resolvedSearchParams = await searchParams;
  const filters = parseFilters(resolvedSearchParams ?? {});
  const [importsResult, contractControlResult] = await Promise.all([
    getRecentBatches(),
    getContractControlResult(filters),
  ]);
  const setupError =
    importsResult.setupError || contractControlResult.setupError;

  return (
    <AppShell>
      <PageHeader />
      {setupError ? (
        <section className="rounded-base border border-link bg-link/20 p-5 text-sm text-text-primary">
          <p className="font-semibold">Falta configurar Supabase local</p>
          <p className="mt-2">
            Crea un archivo <code>.env.local</code> usando{" "}
            <code>.env.local.example</code> y agrega <code>SUPABASE_URL</code>{" "}
            y <code>SUPABASE_SERVICE_ROLE_KEY</code>.
          </p>
        </section>
      ) : null}

      <ContractControlDashboard metrics={contractControlResult.metrics} />
      <ContractControlFilters
        empleadores={contractControlResult.empleadores}
        filters={filters}
        limit={contractControlResult.limit}
        total={contractControlResult.total}
        visible={contractControlResult.rows.length}
      />

      {contractControlResult.setupError ? (
        <section className="rounded-base border border-red-200 bg-red-50 p-5 text-sm text-red-800">
          <p className="font-semibold">
            No se pudo leer la vista de control de contratos
          </p>
          <p className="mt-2">{contractControlResult.setupError}</p>
        </section>
      ) : null}

      <ContractControlTable rows={contractControlResult.rows} />

      <section className="grid gap-6 xl:grid-cols-[minmax(360px,480px)_1fr]">
        <ImportUploadForm />
        <RecentImportsTable batches={importsResult.batches} />
      </section>
    </AppShell>
  );
}

function parseFilters(
  searchParams: Record<string, string | string[] | undefined>,
): ContractFilters {
  const q = getSingleSearchParam(searchParams.q)?.trim();
  const empleador = getSingleSearchParam(searchParams.empleador)?.trim();
  const rawStatus = getSingleSearchParam(searchParams.status);

  return {
    q: q || undefined,
    empleador: empleador || undefined,
    status: parseContractOperationalStatus(rawStatus),
  };
}

function getSingleSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function getContractControlResult(filters: ContractFilters) {
  try {
    return {
      ...(await getContractControlData(filters)),
      setupError: null,
    };
  } catch (error) {
    return {
      rows: [],
      metrics: EMPTY_CONTRACT_CONTROL_METRICS,
      empleadores: [],
      total: 0,
      limit: 50,
      setupError:
        error instanceof Error
          ? error.message
          : "No se pudo leer el control de contratos.",
    };
  }
}

async function getRecentBatches() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("import_batches")
      .select(
        "id, filename, status, total_rows, valid_rows, invalid_rows, duplicate_rows, applied_rows, changed_rows, unchanged_rows, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) {
      throw error;
    }

    return {
      batches: (data ?? []) as ImportBatch[],
      setupError: null,
    };
  } catch (error) {
    return {
      batches: [] as ImportBatch[],
      setupError:
        error instanceof Error
          ? error.message
          : "No se pudo leer Supabase.",
    };
  }
}

function RecentImportsTable({ batches }: { batches: ImportBatch[] }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <h2 className="text-h2 font-semibold text-text-primary">
          Importaciones recientes
        </h2>
      </CardHeader>
      <DataTable>
        <DataTableHead>
          <tr>
            <DataTableHeaderCell>Archivo</DataTableHeaderCell>
            <DataTableHeaderCell>Estado</DataTableHeaderCell>
            <DataTableHeaderCell>Filas</DataTableHeaderCell>
            <DataTableHeaderCell>Validas</DataTableHeaderCell>
            <DataTableHeaderCell>Invalidas</DataTableHeaderCell>
            <DataTableHeaderCell>Duplicadas</DataTableHeaderCell>
            <DataTableHeaderCell>Aplicadas</DataTableHeaderCell>
            <DataTableHeaderCell>Cambios</DataTableHeaderCell>
            <DataTableHeaderCell>Accion</DataTableHeaderCell>
            <DataTableHeaderCell>Fecha</DataTableHeaderCell>
          </tr>
        </DataTableHead>
        <tbody>
          {batches.length > 0 ? (
            batches.map((batch) => (
              <tr className="border-t border-border/70" key={batch.id}>
                <DataTableCell className="font-medium text-text-primary">
                  {batch.filename}
                </DataTableCell>
                <DataTableCell>
                  <StatusBadge
                    status={batch.status}
                    tone={getImportStatusTone(batch.status)}
                  />
                </DataTableCell>
                <DataTableCell>{batch.total_rows}</DataTableCell>
                <DataTableCell>{batch.valid_rows}</DataTableCell>
                <DataTableCell>{batch.invalid_rows}</DataTableCell>
                <DataTableCell>{batch.duplicate_rows}</DataTableCell>
                <DataTableCell>{batch.applied_rows}</DataTableCell>
                <DataTableCell>
                  {batch.changed_rows}/{batch.unchanged_rows}
                </DataTableCell>
                <DataTableCell>
                  {batch.status === "validando" && batch.valid_rows > 0 ? (
                    <ApplyImportButton batchId={batch.id} />
                  ) : (
                    <span className="text-text-muted">-</span>
                  )}
                </DataTableCell>
                <DataTableCell className="text-text-muted">
                  {new Intl.DateTimeFormat("es-MX", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(batch.created_at))}
                </DataTableCell>
              </tr>
            ))
          ) : (
            <DataTableEmpty colSpan={10}>
              Sin importaciones registradas.
            </DataTableEmpty>
          )}
        </tbody>
      </DataTable>
    </Card>
  );
}

function getImportStatusTone(status: string): StatusTone {
  if (status.includes("error")) {
    return "danger";
  }

  if (status === "aplicada") {
    return "success";
  }

  if (status === "validando") {
    return "warning";
  }

  return "neutral";
}
