import { notFound } from "next/navigation";
import { Screen, Grid } from "@/ui/screen";
import { BlockTitle, Card, Datum, Stack } from "@/ui/surface";
import { ErrorState, ProblemNote, SuccessNote } from "@/ui/states";
import { getCycleDetailData, type CycleDetail } from "@/lib/backoffice/cycles";
import { getCurrentActor, hasRole } from "@/lib/auth/roles";
import { AccionesCiclo } from "../_ui/acciones-ciclo";
import { EmpleadosDelCiclo } from "../_ui/empleados-del-ciclo";
import { formatearDinero, formatearEntero, formatearFecha } from "../_ui/comun";

/** Las firmas entran por webhook en cualquier momento: siempre lectura fresca. */
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ loteId: string }>;
  searchParams: Promise<{ action_status?: string; nuevas?: string }>;
};

export default async function PantallaCiclo({ params, searchParams }: Props) {
  const { loteId } = await params;
  const { action_status: resultadoAccion, nuevas } = await searchParams;

  const actor = await getCurrentActor().catch(() => null);
  const puedeOperar = hasRole(actor?.role ?? "solo_lectura", "operaciones");

  let ciclo: CycleDetail | null = null;
  let falloLaLectura = false;
  try {
    ciclo = await getCycleDetailData(loteId);
  } catch (error) {
    console.error(error);
    falloLaLectura = true;
  }

  if (falloLaLectura) {
    return (
      <Screen title="Ciclo" back={{ href: "/nomina", label: "Volver a Nómina" }}>
        <ErrorState
          title="No se pudo abrir este ciclo"
          hint="Es un problema temporal. Recarga la pantalla; si sigue igual, avisa a soporte."
        />
      </Screen>
    );
  }

  if (!ciclo) notFound();

  const aviso = leerAviso(resultadoAccion, nuevas);

  return (
    <Screen
      title={ciclo.label}
      lead={`Ciclo aplicado el ${formatearFecha(ciclo.appliedAt)}.`}
      back={{ href: "/nomina", label: "Volver a Nómina" }}
      action={
        <AccionesCiclo batchId={ciclo.batchId} firmados={ciclo.firmados} puedeOperar={puedeOperar} />
      }
    >
      <Stack gap="gap-8">
        {/* El resultado de "Actualizar estados" vuelve por la URL: la server
            action redirige aquí con action_status y, si sincronizó, nuevas. */}
        {aviso ? (
          aviso.tono === "bien" ? (
            <SuccessNote>{aviso.texto}</SuccessNote>
          ) : (
            <ProblemNote>{aviso.texto}</ProblemNote>
          )
        ) : null}

        <Grid cols="sm:grid-cols-3">
          <Card>
            <Datum label="Empleados en el ciclo" value={formatearEntero(ciclo.total)} tone="strong" />
          </Card>
          <Card>
            <Datum
              label="Ya firmaron"
              value={`${formatearEntero(ciclo.firmados)} de ${formatearEntero(ciclo.total)}`}
              tone="strong"
            />
          </Card>
          <Card>
            <Datum label="Monto firmado" value={formatearDinero(ciclo.montoFirmado)} tone="strong" />
          </Card>
        </Grid>

        <section>
          <BlockTitle
            title="Empleados de este ciclo"
            hint="Toca un conteo para ver solo ese grupo. Entra a una persona para ver su expediente."
          />
          <EmpleadosDelCiclo empleados={ciclo.employees} />
        </section>
      </Stack>
    </Screen>
  );
}

/**
 * Traduce el resultado de la server action. Son los tres únicos `action_status`
 * que `syncCycleStatusesAction` puede devolver a esta pantalla.
 */
function leerAviso(
  estado: string | undefined,
  nuevas: string | undefined,
): { tono: "bien" | "problema"; texto: string } | null {
  if (estado === "forbidden") {
    return {
      tono: "problema",
      texto: "Tu rol no permite actualizar los estados de este ciclo. Pídeselo a un administrador.",
    };
  }

  if (estado === "sync_error") {
    return {
      tono: "problema",
      texto:
        "No se pudo revisar el estado de las firmas. Vuelve a intentarlo en un minuto; si sigue igual, avisa a soporte.",
    };
  }

  if (estado === "synced") {
    const cuantas = Number.parseInt(nuevas ?? "0", 10);
    const encontradas = Number.isFinite(cuantas) && cuantas > 0 ? cuantas : 0;
    return {
      tono: "bien",
      texto:
        encontradas > 0
          ? `Se marcaron ${formatearEntero(encontradas)} firmas nuevas en este ciclo.`
          : "Ciclo al día: no hay firmas nuevas desde la última revisión.",
    };
  }

  return null;
}
