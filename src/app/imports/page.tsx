import { ApplyImportButton } from "@/components/imports/apply-import-button";
import { ImportUploadForm } from "@/components/imports/import-upload-form";
import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DataTable, DataTableCell, DataTableHead, DataTableHeaderCell } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
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
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <div className="flex items-center gap-2">
            <svg className="h-5 w-5 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="font-bold">Falta configurar Supabase local</p>
          </div>
          <p className="mt-1.5 ml-7">Configura SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY para ver importaciones.</p>
        </section>
      ) : null}
      <section className="grid gap-6 xl:grid-cols-1">
        <ImportUploadForm />
      </section>
      <RecentImportsTable batches={importsResult.batches} />
    </AppShell>
  );
}

function RecentImportsTable({ batches }: { batches: ImportBatch[] }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-surface-muted border border-border/60">
            <svg className="h-4.5 w-4.5 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <div>
            <h2 className="text-[16px] font-bold text-text-primary">Historial de importaciones</h2>
            <p className="mt-0.5 text-[12px] text-text-muted">Fecha, archivo, estado y acciones operativas principales.</p>
          </div>
        </div>
      </CardHeader>
      {batches.length === 0 ? (
        <CardBody>
          <EmptyState title="Sin importaciones todavía" description="Cuando subas tu primer CSV, aparecerá aquí con su estado y resumen de filas." />
        </CardBody>
      ) : (
        <DataTable className="min-w-[760px]">
          <DataTableHead>
            <tr>
              <DataTableHeaderCell>Archivo</DataTableHeaderCell>
              <DataTableHeaderCell>Estado</DataTableHeaderCell>
              <DataTableHeaderCell>Resumen</DataTableHeaderCell>
              <DataTableHeaderCell>Acción</DataTableHeaderCell>
              <DataTableHeaderCell>Fecha</DataTableHeaderCell>
            </tr>
          </DataTableHead>
          <tbody>
            {batches.map((batch, i) => (
              <tr
                className={[
                  "border-t border-border/40 transition-colors hover:bg-primary-light/30",
                  i % 2 === 1 ? "bg-surface-muted/25" : "",
                ].join(" ")}
                key={batch.id}
              >
                <DataTableCell className="font-bold text-text-primary">
                  <div className="flex items-center gap-2">
                    <svg className="h-3.5 w-3.5 text-text-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    {batch.filename}
                  </div>
                </DataTableCell>
                <DataTableCell>
                  <StatusBadge status={formatStatus(batch.status)} tone={getImportStatusTone(batch.status)} />
                </DataTableCell>
                <DataTableCell className="text-[12px] text-text-muted">
                  <span className="font-semibold text-text-primary">{batch.total_rows}</span> filas ·{" "}
                  <span className="text-emerald-600 font-semibold">{batch.valid_rows}</span> válidas ·{" "}
                  <span className={batch.invalid_rows > 0 ? "text-amber-600 font-semibold" : ""}>{batch.invalid_rows}</span> inválidas ·{" "}
                  {batch.duplicate_rows} dup.
                </DataTableCell>
                <DataTableCell>
                  {batch.status === "validando" && batch.valid_rows > 0
                    ? <ApplyImportButton batchId={batch.id} />
                    : <span className="text-[12px] text-text-disabled">Sin acción</span>
                  }
                </DataTableCell>
                <DataTableCell className="text-[12px] text-text-muted">{formatDate(batch.created_at)}</DataTableCell>
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
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
