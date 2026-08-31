import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { CycleTable } from "@/components/cycles/cycle-table";
import { getCycleListData, type CycleListRow } from "@/lib/backoffice/cycles";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function CyclesPage() {
  let rows: CycleListRow[] = [];
  let loadError = false;
  try {
    ({ rows } = await getCycleListData());
  } catch {
    loadError = true;
  }

  return (
    <AppShell>
      <PageHeader title="Ciclos" />
      {loadError ? (
        <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-800">
          No se pudieron cargar los ciclos. Revisa la conexión con la base de datos.
        </Card>
      ) : (
        <>
          <Card className="p-4">
            <p className="text-sm text-text-muted">
              Cada <strong className="text-text-primary">ciclo</strong> es un lote de empleados que importaste (una
              quincena/mes). Aquí ves cuántos <strong className="text-text-primary">firmaron</strong> de cada uno y
              puedes exportar el Excel de firmados desde el detalle.
            </p>
          </Card>
          <CycleTable rows={rows} />
        </>
      )}
    </AppShell>
  );
}
