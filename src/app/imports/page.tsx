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
      <PageHeader
        title="Importar empleados y ofertas"
        description="Flujo guiado para subir CSV, validar datos y aplicar filas válidas sin depender de personal técnico."
      />
      {importsResult.setupError ? (
        <section className="rounded-base border border-link bg-link/20 p-5 text-sm text-text-primary">
          <p className="font-semibold">Falta configurar Supabase local</p>
          <p className="mt-2">Configura SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY para ver importaciones.</p>
        </section>
      ) : null}
      <section className="grid gap-6 xl:grid-cols-[minmax(360px,520px)_1fr]">
        <ImportUploadForm />
        <ImportGuidanceCard />
      </section>
      <RecentImportsTable batches={importsResult.batches} />
    </AppShell>
  );
}

function ImportGuidanceCard() {
  return (
    <Card>
      <CardHeader>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Paso 2 y 3</p>
        <h2 className="mt-1 text-h2 font-semibold text-text-primary">Validar y aplicar</h2>
      </CardHeader>
      <CardBody className="space-y-4 text-sm text-text-muted">
        <div className="rounded-base border border-border bg-surface-muted p-4">
          <p className="font-semibold text-text-primary">Resultado de validación</p>
          <p className="mt-1">Después de subir el archivo verás total de filas, filas válidas, inválidas y duplicados.</p>
        </div>
        <div className="rounded-base border border-border bg-surface-muted p-4">
          <p className="font-semibold text-text-primary">Aplicar importación</p>
          <p className="mt-1">El botón se habilita cuando existan filas válidas. Se pedirá confirmación antes de crear o actualizar empleados, cuentas bancarias y ofertas vigentes.</p>
        </div>
        <div className="rounded-base border border-border bg-surface-muted p-4">
          <p className="font-semibold text-text-primary">Si hay errores</p>
          <p className="mt-1">Corrige el CSV desde Sheets o Excel y vuelve a subirlo. Evitamos términos técnicos en esta pantalla para operación diaria.</p>
        </div>
      </CardBody>
    </Card>
  );
}

function RecentImportsTable({ batches }: { batches: ImportBatch[] }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <h2 className="text-h2 font-semibold text-text-primary">Historial de importaciones</h2>
        <p className="mt-1 text-sm text-text-muted">Fecha, archivo, estado y acciones operativas principales.</p>
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
            {batches.map((batch) => (
              <tr className="border-t border-border/70 transition hover:bg-surface-muted/70" key={batch.id}>
                <DataTableCell className="font-medium text-text-primary">{batch.filename}</DataTableCell>
                <DataTableCell><StatusBadge status={formatStatus(batch.status)} tone={getImportStatusTone(batch.status)} /></DataTableCell>
                <DataTableCell className="text-sm text-text-muted">
                  {batch.total_rows} filas · {batch.valid_rows} válidas · {batch.invalid_rows} inválidas · {batch.duplicate_rows} duplicadas
                </DataTableCell>
                <DataTableCell>{batch.status === "validando" && batch.valid_rows > 0 ? <ApplyImportButton batchId={batch.id} /> : <span className="text-text-muted">Sin acción</span>}</DataTableCell>
                <DataTableCell className="text-text-muted">{formatDate(batch.created_at)}</DataTableCell>
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
