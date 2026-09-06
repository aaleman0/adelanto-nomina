"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { Button } from "@/ui/button";
import { CountTile, Status, type Tone } from "@/ui/status";
import { Empty } from "@/ui/states";
import { Grid } from "@/ui/screen";
import { rowVariants } from "@/ui/motion";
import type { CycleEmployeeRow, CycleEstado } from "@/lib/backoffice/cycles";
import { formatearDinero } from "./comun";

/**
 * Empleados de un ciclo, filtrables por estado sin recargar.
 *
 * El estado que se pinta es el del CICLO (lo que decide `getCycleDetailData`),
 * no el operativo del expediente: aquí la pregunta es "¿ya firmó lo de este
 * archivo?", y esa la contesta la solicitud de contrato de la oferta del lote.
 */

type Filtro = "todos" | CycleEstado;

/**
 * Traducción de los tres estados del ciclo. Se reusa el vocabulario que ya
 * conoce el operador ("Firmado", "En proceso"); "Sin contrato" existe solo aquí
 * porque no hay estado equivalente en base de datos: es la ausencia de uno.
 */
const ESTADO: Record<CycleEstado, { label: string; tone: Tone }> = {
  firmado: { label: "Firmado", tone: "done" },
  en_proceso: { label: "En proceso", tone: "progress" },
  sin_contrato: { label: "Sin contrato", tone: "wait" },
};

/** Tanda de filas visibles: un ciclo puede traer cientos y no todas se leen. */
const TANDA = 50;

export function EmpleadosDelCiclo({ empleados }: { empleados: CycleEmployeeRow[] }) {
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [visibles, setVisibles] = useState(TANDA);

  const conteos = useMemo(() => {
    const base = { todos: empleados.length, firmado: 0, en_proceso: 0, sin_contrato: 0 };
    for (const e of empleados) base[e.estado] += 1;
    return base;
  }, [empleados]);

  const filtrados = useMemo(
    () => (filtro === "todos" ? empleados : empleados.filter((e) => e.estado === filtro)),
    [empleados, filtro],
  );

  function cambiarFiltro(nuevo: Filtro) {
    setFiltro(nuevo);
    // Al cambiar de filtro se vuelve al principio: la tanda anterior ya no aplica.
    setVisibles(TANDA);
  }

  if (empleados.length === 0) {
    return (
      <Empty
        title="Este ciclo no tiene empleados"
        hint="El archivo se aplicó pero no dejó ninguna oferta. Revisa el archivo del periodo y vuelve a cargarlo."
      />
    );
  }

  const enPantalla = filtrados.slice(0, visibles);

  return (
    <div className="flex flex-col gap-6">
      <Grid cols="grid-cols-2 xl:grid-cols-4">
        <CountTile
          count={conteos.todos}
          label="Todos"
          tone="wait"
          active={filtro === "todos"}
          onClick={() => cambiarFiltro("todos")}
        />
        <CountTile
          count={conteos.firmado}
          label="Firmaron"
          tone="done"
          active={filtro === "firmado"}
          onClick={() => cambiarFiltro("firmado")}
        />
        <CountTile
          count={conteos.en_proceso}
          label="En proceso"
          tone="progress"
          active={filtro === "en_proceso"}
          onClick={() => cambiarFiltro("en_proceso")}
        />
        <CountTile
          count={conteos.sin_contrato}
          label="Sin contrato"
          tone="wait"
          active={filtro === "sin_contrato"}
          onClick={() => cambiarFiltro("sin_contrato")}
        />
      </Grid>

      {filtrados.length === 0 ? (
        <Empty
          title="Nadie está en ese estado"
          hint="Toca otro conteo de arriba para ver el resto del ciclo."
          action={
            <Button variant="secondary" size="lg" onClick={() => cambiarFiltro("todos")}>
              Ver a todos
            </Button>
          }
        />
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {/* initial={false}: al abrir la pantalla las filas ya están; solo se
                animan las que entran y salen al cambiar de filtro. */}
            <AnimatePresence initial={false}>
              {enPantalla.map((empleado) => (
                <motion.li
                  key={empleado.employeeId}
                  variants={rowVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="overflow-hidden"
                >
                  <Link
                    href={`/personas/${empleado.employeeId}`}
                    className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4 rounded-lg bg-surface px-6 py-5 shadow-1 hover:bg-surface-hover focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-action"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[19px] font-bold text-ink">{empleado.nombre}</p>
                      <p className="mt-0.5 font-mono text-[15px] text-ink-3">
                        {empleado.rfc || "Sin RFC"}
                      </p>
                    </div>
                    <div className="flex items-center gap-6">
                      <span className="tabular text-[19px] font-semibold text-ink">
                        {formatearDinero(empleado.monto)}
                      </span>
                      <Status value={ESTADO[empleado.estado]} />
                    </div>
                  </Link>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>

          {visibles < filtrados.length ? (
            <div className="flex flex-col items-center gap-3">
              <Button variant="secondary" size="lg" onClick={() => setVisibles((v) => v + TANDA)}>
                Ver {Math.min(TANDA, filtrados.length - visibles)} empleados más
              </Button>
              <p className="text-[15px] text-ink-3">
                Viendo {enPantalla.length} de {filtrados.length}
              </p>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
