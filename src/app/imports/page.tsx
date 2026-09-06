import { ApplyImportButton } from "@/components/imports/apply-import-button";
import { ImportUploadForm } from "@/components/imports/import-upload-form";
import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { DataTable, DataTableCell, DataTableHead, DataTableHeaderCell } from "@/components/ui/data-table";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
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

export default async function ImportsPage() {
  const importsResult = await getRecentBatches();

  return (
    <AppShell>
      <PageHeader title="Importaciones" />
      {importsResult.setupError ? (
        <section className="note note-warning py-1 text-sm text-warning">
          <p className="font-medium">Falta configurar Supabase local</p>
          <p className="mt-1 text-warning">Configura SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY para ver importaciones.</p>
        </section>
      ) : null}
      <ImportUploadForm />
      <RecentImportsTable batches={importsResult.batches} />
    </AppShell>
  );
}

function RecentImportsTable({ batches }: { batches: ImportBatch[] }) {
  return (
    <Card className="surface-panel max-h-[420px] overflow-auto p-4">
      <h2 className="text-sm font-medium text-text-muted">Historial de importaciones</h2>
      {batches.length === 0 ? (
        <p className="mt-3 text-sm text-text-muted">Sin importaciones todavía.</p>
      ) : (
        <DataTable className="mt-3 min-w-[640px]">
          <DataTableHead>
            <tr>
              <DataTableHeaderCell>Archivo</DataTableHeaderCell>
              <DataTableHeaderCell>Estado</DataTableHeaderCell>
              <DataTableHeaderCell>Filas</DataTableHeaderCell>
              <DataTableHeaderCell>Acción</DataTableHeaderCell>
              <DataTableHeaderCell>Fecha</DataTableHeaderCell>
            </tr>
          </DataTableHead>
          <tbody>
            {batches.map((batch) => (
              <tr key={batch.id} className="border-t border-border hover:bg-surface-muted/50">
                <DataTableCell className="font-medium text-text-primary">{batch.filename}</DataTableCell>
                <DataTableCell>
                  <StatusBadge status={formatStatus(batch.status)} tone={getImportStatusTone(batch.status)} />
                </DataTableCell>
                <DataTableCell className="text-sm text-text-muted">
                  {batch.total_rows} total · {batch.valid_rows} válidas · {batch.invalid_rows} inválidas
                </DataTableCell>
                <DataTableCell>
                  {batch.status === "validando" && batch.valid_rows > 0 ? (
                    <ApplyImportButton batchId={batch.id} />
                  ) : (
                    <span className="text-sm text-text-disabled">-</span>
                  )}
                </DataTableCell>
                <DataTableCell className="text-sm text-text-muted">{formatDate(batch.created_at)}</DataTableCell>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </Card>
  );
}

async function getRecentBatches() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("import_batches")
      .select("id, filename, status, total_rows, valid_rows, invalid_rows, duplicate_rows, applied_rows, changed_rows, unchanged_rows, created_at")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) throw error;

    return { batches: (data ?? []) as ImportBatch[], setupError: null };
  } catch (error) {
    return { batches: [] as ImportBatch[], setupError: error instanceof Error ? error.message : "No se pudo leer Supabase." };
  }
}

function getImportStatusTone(status: string): StatusTone {
  if (status.includes("error")) return "danger";
  if (status === "aplicada") return "success";
  if (status === "validando") return "warning";
  return "neutral";
}

function formatStatus(value: string) {
  return value.replaceAll("_", " ");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "short" }).format(new Date(value));
}
