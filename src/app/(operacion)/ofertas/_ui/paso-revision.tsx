"use client";

import { motion } from "motion/react";
import { CountTile } from "@/ui/status";
import { Button } from "@/ui/button";
import { Sunken } from "@/ui/surface";
import { Grid } from "@/ui/screen";
import { Empty, ErrorState, LoadingRows, ProblemNote } from "@/ui/states";
import { Key } from "@/ui/shortcuts";
import { staggerChild, staggerParent } from "@/ui/motion";
import { FilaElegible, Paso } from "./paso";
import {
  explicarMotivo,
  montoMXN,
  nombreCompleto,
  personas,
  type EmpleadoElegibilidad,
} from "./formato";

export type Revision = {
  total: number;
  eligible: number;
  employees: EmpleadoElegibilidad[];
};

/**
 * Revisar antes de mandar.
 *
 * Este paso existe porque el envío es irreversible y le llega a gente real. No
 * basta con decir "128 elegibles": el operador tiene que poder VER las dos
 * listas —quién sí y quién no, con el motivo de cada quien— porque a menudo el
 * motivo delata un error de la carga de nómina, y entonces lo correcto no es
 * enviar sino volver a cargar el archivo.
 */
export function PasoRevision({
  hayDestino,
  revision,
  cargando,
  fallo,
  onRevisar,
  excluidos,
  onAlternar,
  onMarcarTodos,
  esCicloCompleto,
}: {
  hayDestino: boolean;
  revision: Revision | null;
  cargando: boolean;
  fallo: string | null;
  onRevisar: () => void;
  excluidos: Set<string>;
  onAlternar: (employeeId: string) => void;
  onMarcarTodos: () => void;
  esCicloCompleto: boolean;
}) {
  const elegibles = revision?.employees.filter((e) => e.eligible) ?? [];
  const descartados = revision?.employees.filter((e) => !e.eligible) ?? [];
  const marcados = elegibles.filter((e) => !excluidos.has(e.employee_id));
  const sinTelefono = marcados.filter((e) => !e.telefono_normalizado?.trim());

  return (
    <Paso
      numero={3}
      titulo="Revisar antes de mandar"
      proposito="Comprueba a cuántas personas les va a llegar y por qué a las demás no."
      listo={revision !== null && marcados.length > 0}
      resumen={
        revision
          ? `${personas(marcados.length)} van a recibirlo · ${descartados.length} quedan fuera`
          : undefined
      }
    >
      {!hayDestino ? (
        <Sunken>
          <p className="text-[17px] text-ink-2">
            Primero elige a quién le llega, en el paso 1. Con eso el sistema puede decirte quién
            cumple los requisitos.
          </p>
        </Sunken>
      ) : fallo ? (
        <ErrorState
          title="No se pudo revisar la lista"
          hint={fallo}
          onRetry={onRevisar}
          retryLabel="Volver a revisar"
        />
      ) : cargando ? (
        <LoadingRows rows={4} />
      ) : revision === null ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-[17px] leading-relaxed text-ink-2">
            Revisar no manda nada: solo consulta quién tiene oferta vigente y cuenta bancaria para
            recibir el depósito.
          </p>
          <Button variant="primary" size="lg" onClick={onRevisar}>
            Revisar quién puede recibirlo <Key tone="dark">r</Key>
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <Grid cols="sm:grid-cols-3">
            <CountTile count={revision.total} label="Personas en la lista" tone="wait" />
            <CountTile count={marcados.length} label="Van a recibir la oferta" tone="done" />
            <CountTile count={descartados.length} label="Quedan fuera" tone="attention" />
          </Grid>

          {marcados.length === 0 ? (
            <ProblemNote>
              Ahora mismo no hay nadie a quien enviarle. Revisa abajo los motivos: casi siempre es que
              el ciclo ya se envió o que la carga de nómina los marcó como no elegibles.
            </ProblemNote>
          ) : null}

          {sinTelefono.length > 0 ? (
            <ProblemNote>
              {personas(sinTelefono.length)} de las marcadas no tienen teléfono registrado: su mensaje
              va a fallar. Puedes enviarlo igual y corregirlos después, o quitarlos de la lista.
            </ProblemNote>
          ) : null}

          {/* Lista A: quiénes sí */}
          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-[19px] font-bold text-ink">
                Sí reciben la oferta · {marcados.length} de {elegibles.length}
              </h3>
              {excluidos.size > 0 ? (
                <Button variant="quiet" size="sm" onClick={onMarcarTodos}>
                  Volver a marcar a todos
                </Button>
              ) : null}
            </div>

            {elegibles.length === 0 ? (
              <Empty
                title="Nadie de esta lista cumple los requisitos"
                hint="Abajo está el motivo de cada quien. Si esperabas que sí, revisa la carga de nómina del ciclo."
              />
            ) : (
              <>
                {esCicloCompleto && excluidos.size > 0 ? (
                  <p className="mb-3 rounded-md border border-attention-line bg-attention-soft px-4 py-3 text-[15px] leading-snug text-attention">
                    Quitaste a {personas(excluidos.size)} del ciclo. El envío ya no va al ciclo
                    completo: se manda persona por persona, solo a quienes dejaste marcados.
                  </p>
                ) : null}

                <motion.ul
                  variants={staggerParent}
                  initial="initial"
                  animate="animate"
                  className="flex max-h-[26rem] flex-col gap-3 overflow-y-auto pr-1"
                >
                  {elegibles.map((emp) => (
                    <motion.li key={emp.employee_id} variants={staggerChild}>
                      <FilaElegible
                        seleccionada={!excluidos.has(emp.employee_id)}
                        onSeleccionar={() => onAlternar(emp.employee_id)}
                        titulo={nombreCompleto(emp)}
                        detalle={
                          <>
                            <span className="font-mono">{emp.rfc ?? "Sin RFC"}</span>
                            {" · "}
                            {emp.telefono_normalizado?.trim() ? (
                              <span className="font-mono">{emp.telefono_normalizado}</span>
                            ) : (
                              <span className="font-semibold text-failed">Sin teléfono</span>
                            )}
                          </>
                        }
                        extra={
                          <span className="text-[15px] font-bold tabular text-ink-2">
                            {montoMXN(emp.monto_prestamo_autorizado)}
                          </span>
                        }
                      />
                    </motion.li>
                  ))}
                </motion.ul>
              </>
            )}
          </section>

          {/* Lista B: quiénes no, y por qué */}
          {descartados.length > 0 ? (
            <section>
              <h3 className="mb-1 text-[19px] font-bold text-ink">
                No reciben nada · {descartados.length}
              </h3>
              <p className="mb-3 text-[15px] leading-snug text-ink-3">
                No se les manda mensaje. Si algún motivo te sorprende, revisa el expediente de esa
                persona antes de enviar.
              </p>
              <Sunken>
                <ul className="flex max-h-[22rem] flex-col divide-y divide-line overflow-y-auto">
                  {descartados.map((emp) => (
                    <li key={emp.employee_id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-3">
                      <span className="min-w-0 flex-1 text-[17px] font-semibold text-ink">
                        {nombreCompleto(emp)}
                        <span className="ml-3 font-mono text-[15px] font-normal text-ink-3">
                          {emp.rfc ?? "Sin RFC"}
                        </span>
                      </span>
                      <span className="text-[15px] leading-snug text-ink-2">
                        {explicarMotivo(emp.reason)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Sunken>
            </section>
          ) : null}

          <Button variant="secondary" size="md" onClick={onRevisar} className="self-start">
            Volver a revisar la lista
          </Button>
        </div>
      )}
    </Paso>
  );
}
