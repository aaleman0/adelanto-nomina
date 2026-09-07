"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { Sunken } from "@/ui/surface";
import { SearchInput } from "@/ui/field";
import { Empty, ErrorState, LoadingRows, ProblemNote } from "@/ui/states";
import { popVariants, staggerChild, staggerParent } from "@/ui/motion";
import { Alternativas, EnlaceAccion, FilaElegible, Paso } from "./paso";
import {
  fecha,
  montoMXN,
  nombreCompleto,
  pedirJson,
  personas,
  type EmpleadoBase,
  type LoteAplicado,
} from "./formato";

/**
 * A quién le llega la oferta.
 *
 * Dos caminos, no uno: el 90% de los envíos son "todo el ciclo que acabo de
 * cargar", y el resto son casos sueltos (alguien que quedó fuera, una prueba
 * con una persona). Se ofrecen los dos al mismo nivel para que el caso raro no
 * obligue a pelear con la herramienta del caso común.
 */

export type Destino =
  | { tipo: "ciclo"; lote: LoteAplicado }
  | { tipo: "personas"; empleados: EmpleadoBase[] };

export function PasoDestinatarios({
  destino,
  onCambiar,
  puedeBuscarPersonas,
}: {
  destino: Destino | null;
  onCambiar: (d: Destino | null) => void;
  /** La búsqueda devuelve teléfonos y RFC: el backend la reserva a operaciones. */
  puedeBuscarPersonas: boolean;
}) {
  const [modo, setModo] = useState<"ciclo" | "personas">(destino?.tipo ?? "ciclo");

  return (
    <Paso
      numero={1}
      titulo="A quién le llega"
      proposito="Elige el ciclo de nómina completo, o busca a las personas una por una."
      listo={destino !== null}
      resumen={destino ? resumirDestino(destino) : undefined}
    >
      <div className="flex flex-col gap-5">
        <Alternativas
          etiqueta="Cómo elegir a quién enviarle"
          valor={modo}
          onCambiar={(v) => {
            setModo(v);
            // Cambiar de camino borra la elección anterior: mezclar un lote con
            // una lista suelta manda a gente que el operador ya no está viendo.
            if (destino && destino.tipo !== v) onCambiar(null);
          }}
          opciones={[
            { valor: "ciclo", label: "Un ciclo completo", hint: "Todos los de una carga de nómina ya aplicada" },
            { valor: "personas", label: "Personas sueltas", hint: "Búscalas por nombre, RFC o teléfono" },
          ]}
        />

        {modo === "ciclo" ? (
          <ListaDeCiclos
            seleccionado={destino?.tipo === "ciclo" ? destino.lote.id : null}
            onSeleccionar={(lote) => onCambiar({ tipo: "ciclo", lote })}
          />
        ) : (
          <BuscadorDePersonas
            habilitado={puedeBuscarPersonas}
            elegidos={destino?.tipo === "personas" ? destino.empleados : []}
            onCambiar={(empleados) =>
              onCambiar(empleados.length > 0 ? { tipo: "personas", empleados } : null)
            }
          />
        )}
      </div>
    </Paso>
  );
}

export function resumirDestino(destino: Destino): string {
  if (destino.tipo === "ciclo") {
    const nombre = destino.lote.filename ?? "Carga sin nombre";
    return `Ciclo ${nombre} · ${fecha(destino.lote.applied_at)}`;
  }
  return `${personas(destino.empleados.length)} elegidas a mano`;
}

/* ── Camino A: un ciclo completo ─────────────────────────────────────── */

function ListaDeCiclos({
  seleccionado,
  onSeleccionar,
}: {
  seleccionado: string | null;
  onSeleccionar: (lote: LoteAplicado) => void;
}) {
  const [intento, setIntento] = useState(0);

  // La carga recuerda de qué intento salió: al pulsar "volver a cargar", lo que
  // hay en memoria deja de corresponder al intento vigente y la pantalla vuelve
  // sola al esqueleto, sin limpiar estado dentro del efecto.
  const [carga, setCarga] = useState<{
    intento: number;
    lotes: LoteAplicado[] | null;
    fallo: string | null;
  } | null>(null);

  const vigente = carga?.intento === intento ? carga : null;
  const lotes = vigente?.lotes ?? null;
  const fallo = vigente?.fallo ?? null;

  useEffect(() => {
    let activo = true;

    pedirJson<{ imports: LoteAplicado[] }>("/api/whatsapp/imports")
      .then((r) => {
        if (activo) setCarga({ intento, lotes: r.imports ?? [], fallo: null });
      })
      .catch((e: Error) => {
        if (activo) setCarga({ intento, lotes: null, fallo: e.message });
      });

    return () => {
      activo = false;
    };
  }, [intento]);

  if (fallo) {
    return (
      <ErrorState
        title="No se pudieron cargar los ciclos"
        hint={fallo}
        onRetry={() => setIntento((n) => n + 1)}
        retryLabel="Volver a cargar los ciclos"
      />
    );
  }

  if (lotes === null) return <LoadingRows rows={3} />;

  if (lotes.length === 0) {
    return (
      <Empty
        title="Todavía no hay ningún ciclo aplicado"
        hint="Las ofertas salen de una carga de nómina. Carga el archivo del periodo y aplícalo; luego vuelve aquí a enviar."
        action={
          <EnlaceAccion href="/nomina" tono="primary">
            Cargar la nómina del periodo
          </EnlaceAccion>
        }
      />
    );
  }

  return (
    <motion.div variants={staggerParent} initial="initial" animate="animate" className="flex flex-col gap-3">
      {lotes.map((lote, i) => (
        <motion.div key={lote.id} variants={staggerChild}>
          <FilaElegible
            seleccionada={lote.id === seleccionado}
            onSeleccionar={() => onSeleccionar(lote)}
            titulo={lote.filename ?? "Carga sin nombre"}
            detalle={`Aplicada el ${fecha(lote.applied_at)} · ${lote.total_rows ?? 0} filas en el archivo`}
            extra={
              i === 0 ? (
                <span className="rounded-full border border-action-line bg-action-soft px-3 py-1.5 text-[14px] font-bold text-action">
                  La más reciente
                </span>
              ) : null
            }
          />
        </motion.div>
      ))}
      <p className="text-[15px] leading-snug text-ink-3">
        Se muestran los diez ciclos aplicados más recientes. Cuántas personas trae cada uno se confirma
        en el paso 3, al revisar.
      </p>
    </motion.div>
  );
}

/* ── Camino B: personas sueltas ──────────────────────────────────────── */

function BuscadorDePersonas({
  habilitado,
  elegidos,
  onCambiar,
}: {
  habilitado: boolean;
  elegidos: EmpleadoBase[];
  onCambiar: (empleados: EmpleadoBase[]) => void;
}) {
  const [texto, setTexto] = useState("");

  const consulta = texto.trim();

  // La respuesta guarda A QUÉ consulta pertenece. Con eso, "buscando" deja de
  // ser estado (se deduce) y la lista nunca enseña el resultado de lo que el
  // operador ya dejó de escribir: en cuanto cambia el texto, lo guardado deja de
  // corresponder y la vista vuelve al esqueleto sin que el efecto limpie nada.
  const [busqueda, setBusqueda] = useState<{
    consulta: string;
    resultados: EmpleadoBase[] | null;
    fallo: string | null;
  } | null>(null);

  const respuesta = busqueda?.consulta === consulta ? busqueda : null;
  const resultados = respuesta?.resultados ?? null;
  const fallo = respuesta?.fallo ?? null;
  const buscando = habilitado && consulta.length >= 2 && respuesta === null;

  useEffect(() => {
    if (!habilitado || consulta.length < 2) return;

    // Se espera a que deje de escribir: el endpoint hace ILIKE sobre cuatro
    // columnas y una consulta por tecla lo castiga sin darle nada al operador.
    const control = new AbortController();

    const temporizador = setTimeout(() => {
      pedirJson<{ employees: EmpleadoBase[] }>(
        `/api/whatsapp/employees/search?q=${encodeURIComponent(consulta)}&limit=8`,
        { signal: control.signal },
      )
        .then((r) => {
          if (control.signal.aborted) return;
          setBusqueda({ consulta, resultados: r.employees ?? [], fallo: null });
        })
        .catch((e: Error) => {
          if (control.signal.aborted) return;
          setBusqueda({ consulta, resultados: null, fallo: e.message });
        });
    }, 300);

    return () => {
      clearTimeout(temporizador);
      control.abort();
    };
  }, [consulta, habilitado]);

  if (!habilitado) {
    return (
      <ProblemNote>
        Buscar personas muestra teléfonos y RFC, así que requiere rol operaciones. Pídeselo a un
        administrador, o elige un ciclo completo.
      </ProblemNote>
    );
  }

  const yaElegido = (id: string) => elegidos.some((e) => e.employee_id === id);

  return (
    <div className="flex flex-col gap-4">
      <SearchInput
        value={texto}
        onChange={setTexto}
        placeholder="Busca por nombre, RFC o teléfono"
      />

      {consulta.length > 0 && consulta.length < 2 ? (
        <p className="text-[15px] text-ink-3">Escribe al menos dos letras para buscar.</p>
      ) : null}

      {fallo ? <ProblemNote>{fallo}</ProblemNote> : null}

      {buscando ? <LoadingRows rows={2} /> : null}

      {!buscando && resultados !== null && resultados.length === 0 ? (
        <Sunken>
          <p className="text-[17px] text-ink-2">
            Nadie coincide con <strong className="text-ink">{consulta}</strong>. Revisa cómo está
            escrito el nombre, o búscalo por RFC.
          </p>
        </Sunken>
      ) : null}

      {!buscando && resultados !== null && resultados.length > 0 ? (
        <motion.div variants={staggerParent} initial="initial" animate="animate" className="flex flex-col gap-3">
          {resultados.map((emp) => (
            <motion.div key={emp.employee_id} variants={staggerChild}>
              <FilaElegible
                seleccionada={yaElegido(emp.employee_id)}
                onSeleccionar={() => {
                  onCambiar(
                    yaElegido(emp.employee_id)
                      ? elegidos.filter((e) => e.employee_id !== emp.employee_id)
                      : [...elegidos, emp],
                  );
                }}
                titulo={nombreCompleto(emp)}
                detalle={
                  <span className="font-mono">{emp.rfc ?? "Sin RFC"}</span>
                }
                extra={
                  <span className="text-[15px] font-bold tabular text-ink-2">
                    {montoMXN(emp.monto_prestamo_autorizado)}
                  </span>
                }
              />
            </motion.div>
          ))}
        </motion.div>
      ) : null}

      {elegidos.length > 0 ? (
        <Sunken>
          <p className="mb-3 text-[15px] font-bold text-ink">
            Van a recibir la oferta: {personas(elegidos.length)}
          </p>
          <ul className="flex flex-wrap gap-2">
            <AnimatePresence initial={false}>
              {elegidos.map((emp) => (
                <motion.li
                  key={emp.employee_id}
                  layout
                  variants={popVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                >
                  <button
                    type="button"
                    onClick={() => onCambiar(elegidos.filter((e) => e.employee_id !== emp.employee_id))}
                    className="flex items-center gap-2.5 rounded-full border-2 border-action-line bg-surface px-4 py-2 text-[15px] font-semibold text-ink hover:bg-surface-hover"
                  >
                    {nombreCompleto(emp)}
                    <span aria-hidden="true" className="text-ink-3">
                      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.6">
                        <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
                      </svg>
                    </span>
                    <span className="sr-only">Quitar de la lista</span>
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </Sunken>
      ) : null}
    </div>
  );
}
