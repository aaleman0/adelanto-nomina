"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/ui/button";
import { syncCycleStatusesAction } from "../actions";
import { ENLACE_COMO_BOTON } from "./comun";

/**
 * Las dos acciones de un ciclo.
 *
 * Ninguna se confirma: "Actualizar estados" solo PREGUNTA a EasyLex quién firmó
 * (no gasta firmas ni cambia nada del empleado) y exportar solo baja un archivo.
 * Confirmar lo inofensivo entrena al operador a decir que sí sin leer.
 */
export function AccionesCiclo({
  batchId,
  firmados,
  puedeOperar,
}: {
  batchId: string;
  firmados: number;
  puedeOperar: boolean;
}) {
  const puedeExportar = puedeOperar && firmados > 0;

  return (
    <div className="flex flex-col items-start gap-3 sm:items-end">
      <div className="flex flex-wrap items-center gap-3">
        <form action={syncCycleStatusesAction}>
          <input type="hidden" name="batch_id" value={batchId} />
          <BotonActualizar puedeOperar={puedeOperar} />
        </form>

        {puedeExportar ? (
          <a href={`/api/cycles/${batchId}/export`} className={ENLACE_COMO_BOTON}>
            <IconoDescargar />
            Exportar firmados
          </a>
        ) : (
          <Button
            size="lg"
            variant="secondary"
            disabled
            icon={<IconoDescargar />}
          >
            Exportar firmados
          </Button>
        )}
      </div>

      {/* El control deshabilitado siempre dice por qué lo está. */}
      <p className="max-w-sm text-[15px] leading-snug text-ink-3 sm:text-right">
        {!puedeOperar
          ? "Tu rol no permite actualizar ni exportar este ciclo. Pídeselo a un administrador."
          : firmados === 0
            ? "Cuando alguien firme podrás exportar la lista con nombre, RFC y monto."
            : "Actualizar revisa en EasyLex quién ya firmó. Exportar baja la lista de firmados en CSV."}
      </p>
    </div>
  );
}

/**
 * Va dentro del `<form>` a propósito: `useFormStatus` solo ve el envío del
 * formulario que tiene por encima. La acción tarda (consulta EasyLex expediente
 * por expediente), así que el progreso vive en el propio botón.
 */
function BotonActualizar({ puedeOperar }: { puedeOperar: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      size="lg"
      variant="primary"
      loading={pending}
      loadingLabel="Revisando firmas…"
      disabled={!puedeOperar}
      icon={<IconoActualizar />}
    >
      Actualizar estados
    </Button>
  );
}

function IconoActualizar() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3">
      <path d="M20 12a8 8 0 1 1-2.34-5.66" strokeLinecap="round" />
      <path d="M20 4v5h-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconoDescargar() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3">
      <path d="M12 4v12M7 11l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 20h16" strokeLinecap="round" />
    </svg>
  );
}
