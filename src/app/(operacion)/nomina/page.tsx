import { Suspense } from "react";
import Link from "next/link";
import { Screen } from "@/ui/screen";
import { BlockTitle, Card, Datum, Stack } from "@/ui/surface";
import { Empty, ErrorState, LoadingRows } from "@/ui/states";
import { ShortcutBar } from "@/ui/shortcuts";
import { getCycleListData, type CycleListRow } from "@/lib/backoffice/cycles";
import { getCurrentActor, hasRole } from "@/lib/auth/roles";
import { CargarNomina } from "./_ui/cargar-nomina";
import { formatearDinero, formatearEntero, formatearFecha } from "./_ui/comun";

/** El estado de los ciclos cambia con cada firma: nunca se sirve cacheado. */
export const dynamic = "force-dynamic";

export default async function PantallaNomina() {
  const actor = await getCurrentActor().catch(() => null);
  const puedeOperar = hasRole(actor?.role ?? "solo_lectura", "operaciones");

  return (
    <Screen
      title="Nómina"
      lead="Carga el archivo del periodo. Cada archivo que cargas abre un ciclo nuevo y vuelve a habilitar a los empleados que ya estaban."
    >
      <Stack gap="gap-8">
        <CargarNomina puedeOperar={puedeOperar} />

        <section>
          <BlockTitle
            title="Ciclos abiertos hasta hoy"
            hint="Un ciclo por archivo aplicado. Entra para ver quién firmó y exportar la lista."
          />
          {/* La lista tarda más que la zona de carga: se transmite aparte para
              que la acción principal esté disponible desde el primer instante. */}
          <Suspense fallback={<LoadingRows rows={4} />}>
            <ListaDeCiclos />
          </Suspense>
        </section>

        {puedeOperar ? <ShortcutBar items={[{ key: "c", label: "Cargar archivo de nómina" }]} /> : null}
      </Stack>
    </Screen>
  );
}

async function ListaDeCiclos() {
  let ciclos: CycleListRow[];
  try {
    const datos = await getCycleListData();
    ciclos = datos.rows;
  } catch (error) {
    console.error(error);
    return (
      <ErrorState
        title="No se pudieron cargar los ciclos"
        hint="Es un problema temporal. Recarga la pantalla; si sigue igual, avisa a soporte."
      />
    );
  }

  if (ciclos.length === 0) {
    return (
      <Empty
        title="Todavía no hay ningún ciclo"
        hint="En cuanto cargues y apliques el archivo del periodo, aquí aparecerá el ciclo con su avance."
      />
    );
  }

  return (
    <Stack>
      {ciclos.map((ciclo) => (
        <Link
          key={ciclo.batchId}
          href={`/nomina/${ciclo.batchId}`}
          className="block rounded-lg focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-action"
        >
          <Card as="article" interactive>
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div className="min-w-0">
                <h3 className="truncate text-[23px] font-bold leading-tight text-ink">{ciclo.label}</h3>
                <p className="mt-1 text-[17px] text-ink-3">Aplicado el {formatearFecha(ciclo.appliedAt)}</p>
              </div>

              <div className="grid shrink-0 grid-cols-2 gap-x-10 gap-y-4 sm:grid-cols-3">
                <Datum label="Empleados" value={formatearEntero(ciclo.total)} />
                <Datum
                  label="Firmaron"
                  value={`${formatearEntero(ciclo.firmados)} de ${formatearEntero(ciclo.total)}`}
                />
                <Datum label="Monto firmado" value={formatearDinero(ciclo.montoFirmado)} />
              </div>
            </div>
          </Card>
        </Link>
      ))}
    </Stack>
  );
}
