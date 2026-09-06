"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Stack, Card, BlockTitle } from "@/ui/surface";
import { Grid } from "@/ui/screen";
import { Button } from "@/ui/button";
import { CountTile } from "@/ui/status";
import { ConfirmDialog } from "@/ui/overlay";
import { ErrorState, LoadingTiles, ProblemNote, SuccessNote } from "@/ui/states";
import { ShortcutBar, useShortcut } from "@/ui/shortcuts";
import { useToast } from "@/ui/toast";
import { pedirJson, cuerpoJson } from "./red";
import type { PhoneIssue } from "@/lib/whatsapp/phone-utils";

/**
 * Arreglar teléfonos mal capturados.
 *
 * La pantalla se organiza por lo que se PUEDE HACER, no por tipo de dato:
 * primero lo que se corrige con un clic, después lo que obliga a conseguir el
 * número otra vez. Agrupar solo por "tipo de problema" dejaría mezclado lo
 * accionable con lo que no lo es.
 *
 * Un teléfono es corregible cuando el servidor mandó `suggested_fix`. No se
 * deduce del tipo de problema: un número con "+" puede tener corrección o no,
 * según lo que quede al quitarle el signo.
 */

type Fila = {
  employee_id: string;
  nombre: string | null;
  apellidos: string | null;
  rfc: string | null;
  empleador: string | null;
  telefono_normalizado: string | null;
  issue: PhoneIssue;
  suggested_fix: string | null;
};

type Auditoria = {
  total: number;
  ok_count: number;
  issues: number;
  by_issue: Partial<Record<PhoneIssue, number>>;
  rows: Fila[];
};

/** Cada problema explicado sin jerga: qué tiene el número y qué implica. */
const PROBLEMAS: Record<Exclude<PhoneIssue, "ok">, { titulo: string; explicacion: string }> = {
  long_distance: {
    titulo: "Le falta el 1 de celular",
    explicacion:
      "Trae la clave de país (52) pero no el 1 que WhatsApp exige para celulares en México. Meta rechaza el envío.",
  },
  missing_prefix: {
    titulo: "Le falta la clave de país",
    explicacion:
      "Son los 10 dígitos locales, como se marca dentro de la ciudad. Le falta el 52 1 del inicio.",
  },
  has_plus: {
    titulo: "Trae el signo +",
    explicacion: "Se guardó con + al principio. WhatsApp lo quiere solo con dígitos.",
  },
  too_short: {
    titulo: "Le faltan dígitos",
    explicacion:
      "Tiene menos de 10 dígitos: el número está incompleto y no hay forma de adivinar el resto.",
  },
  too_long: {
    titulo: "Tiene dígitos de más",
    explicacion:
      "Trae más dígitos de los que cabe un número. Casi siempre son dos números pegados o una extensión.",
  },
  null_or_empty: {
    titulo: "No tiene teléfono",
    explicacion: "Ese empleado llegó en la nómina sin ningún número.",
  },
};

/** Orden de aparición: primero lo más frecuente de arreglar. */
const ORDEN: Array<Exclude<PhoneIssue, "ok">> = [
  "missing_prefix",
  "long_distance",
  "has_plus",
  "null_or_empty",
  "too_short",
  "too_long",
];

/** Tope por petición. El endpoint acepta 5000; se manda en tandas más chicas
 *  para que un lote grande no viaje en un solo cuerpo enorme. */
const TANDA = 500;

const POR_GRUPO = 20;

function nombreDe(f: Fila): string {
  const completo = [f.nombre, f.apellidos].filter(Boolean).join(" ").trim();
  if (completo) return completo;
  return f.rfc ? `Sin nombre (${f.rfc})` : "Sin nombre";
}

export function AuditoriaTelefonos() {
  const toast = useToast();
  /**
   * `datos === null` significa "la revisión todavía no ha vuelto". Estar
   * cargando se DEDUCE de eso y del error, en vez de guardarse: guardarlo
   * obligaba a ponerlo en "loading" de forma síncrona dentro del efecto, que es
   * lo que encadena renders.
   */
  const [datos, setDatos] = useState<Auditoria | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [corrigiendo, setCorrigiendo] = useState(false);
  const [problema, setProblema] = useState<{ mensaje: string; detalle?: string } | null>(null);
  const [expandidos, setExpandidos] = useState<Record<string, boolean>>({});

  const cargando = datos === null && errorCarga === null;

  /**
   * Todos los setState quedan DESPUÉS del await, nunca en el arranque síncrono.
   * `vigente` deja descartar una respuesta que llegó tarde; por defecto se
   * aplica siempre, porque un reintento del operador sí quiere su resultado.
   */
  const cargar = useCallback(async (vigente: () => boolean = () => true) => {
    const r = await pedirJson<Auditoria>("/api/whatsapp/phone-audit", { cache: "no-store" });
    if (!vigente()) return;
    if (!r.ok) {
      setErrorCarga(r.mensaje);
      return;
    }
    setErrorCarga(null);
    setDatos(r.datos);
    setExpandidos({});
  }, []);

  useEffect(() => {
    let vivo = true;
    // La petición vive en su propia función async: así el cuerpo del efecto no
    // escribe estado (eso encadena renders) y al cerrar la pantalla la
    // respuesta en camino se tira en vez de tocar un árbol ya desmontado.
    void (async () => {
      await cargar(() => vivo);
    })();
    return () => {
      vivo = false;
    };
  }, [cargar]);

  /**
   * Vaciar lo que hay antes de pedir es lo que devuelve el esqueleto y deja ver
   * que la revisión está corriendo otra vez. Se hace aquí, en el manejador de
   * quien pulsa, que es donde sí se puede limpiar estado.
   */
  const revisarDeNuevo = useCallback(() => {
    setDatos(null);
    setErrorCarga(null);
    return cargar();
  }, [cargar]);

  // El atajo se apaga mientras se corrige: recargar a media escritura dejaría
  // la pantalla mostrando un estado que ya no corresponde. El manejador se
  // memoriza porque `useShortcut` lo lleva en sus dependencias.
  const recargar = useCallback(() => {
    void revisarDeNuevo();
  }, [revisarDeNuevo]);
  useShortcut("r", recargar, { enabled: !corrigiendo });

  const { corregibles, manuales } = useMemo(() => {
    const filas = datos?.rows ?? [];
    const conProblema = filas.filter((f) => f.issue !== "ok");
    return {
      corregibles: conProblema.filter((f) => f.suggested_fix !== null),
      manuales: conProblema.filter((f) => f.suggested_fix === null),
    };
  }, [datos]);

  const gruposCorregibles = useMemo(() => agrupar(corregibles), [corregibles]);
  const gruposManuales = useMemo(() => agrupar(manuales), [manuales]);

  async function corregir() {
    setConfirmando(false);
    setCorrigiendo(true);
    setProblema(null);

    let arreglados = 0;
    let fallidos = 0;

    for (let i = 0; i < corregibles.length; i += TANDA) {
      const tanda = corregibles.slice(i, i + TANDA).map((f) => ({
        employee_id: f.employee_id,
        telefono_normalizado: f.suggested_fix as string,
      }));

      const r = await pedirJson<{ fixed: number; errors: number }>(
        "/api/whatsapp/phone-audit/fix",
        cuerpoJson({ fixes: tanda }),
      );

      if (!r.ok) {
        setCorrigiendo(false);
        setProblema({ mensaje: r.mensaje, detalle: r.detalle });
        toast.failed(
          arreglados > 0
            ? `Se corrigieron ${arreglados} antes de fallar. Vuelve a intentar con el resto.`
            : "No se corrigió ningún teléfono.",
        );
        await revisarDeNuevo();
        return;
      }

      arreglados += r.datos.fixed ?? 0;
      fallidos += r.datos.errors ?? 0;
    }

    setCorrigiendo(false);
    toast.done(
      arreglados === 1 ? "Se corrigió 1 teléfono." : `Se corrigieron ${arreglados} teléfonos.`,
    );
    if (fallidos > 0) {
      setProblema({
        mensaje: `${fallidos} teléfono${fallidos === 1 ? "" : "s"} no se pudo corregir. Revisa la lista de abajo: siguen apareciendo.`,
      });
    }
    await revisarDeNuevo();
  }

  if (cargando) {
    return (
      <Stack>
        <Card>
          <p className="text-[19px] font-bold text-ink">Revisando todos los teléfonos…</p>
          <p className="mt-1.5 text-[17px] leading-relaxed text-ink-2">
            Se leen uno por uno los números de toda la base, no solo los del último periodo.
            Con muchas personas puede tardar varios segundos.
          </p>
        </Card>
        <LoadingTiles tiles={3} />
      </Stack>
    );
  }

  if (errorCarga !== null || datos === null) {
    return (
      <ErrorState
        title="No se pudo revisar los teléfonos"
        hint={errorCarga ?? "Vuelve a intentarlo."}
        onRetry={recargar}
      />
    );
  }

  return (
    <Stack>
      <Grid cols="sm:grid-cols-3">
        <CountTile count={datos.total} label="Teléfonos revisados" tone="wait" />
        <CountTile count={datos.ok_count} label="En el formato correcto" tone="done" />
        <CountTile count={datos.issues} label="Con algún problema" tone="attention" />
      </Grid>

      {problema ? (
        <ProblemNote>
          {problema.mensaje}
          {problema.detalle ? (
            <span className="mt-1 block text-[15px] font-normal opacity-80">
              Detalle para soporte: {problema.detalle}
            </span>
          ) : null}
        </ProblemNote>
      ) : null}

      {datos.issues === 0 ? (
        <Card>
          <SuccessNote>
            Todos los teléfonos están en el formato que WhatsApp acepta. No hay nada que corregir.
          </SuccessNote>
        </Card>
      ) : null}

      {corregibles.length > 0 ? (
        <Card>
          <BlockTitle
            title={
              corregibles.length === 1
                ? "1 teléfono se arregla solo"
                : `${corregibles.length} teléfonos se arreglan solos`
            }
            hint="A estos les falta o les sobra el prefijo, y el formato correcto se deduce sin ambigüedad. Nadie tiene que volver a preguntarle el número al empleado."
            action={
              <Button
                variant="primary"
                size="lg"
                onClick={() => setConfirmando(true)}
                loading={corrigiendo}
                loadingLabel="Corrigiendo…"
              >
                Corregir automáticamente
              </Button>
            }
          />

          <div className="flex flex-col gap-6">
            {ORDEN.filter((tipo) => (gruposCorregibles[tipo] ?? []).length > 0).map((tipo) => (
              <GrupoProblema
                key={tipo}
                tipo={tipo}
                filas={gruposCorregibles[tipo] ?? []}
                mostrarCorreccion
                expandido={expandidos[`c-${tipo}`] ?? false}
                onExpandir={() => setExpandidos((p) => ({ ...p, [`c-${tipo}`]: true }))}
              />
            ))}
          </div>
        </Card>
      ) : null}

      {manuales.length > 0 ? (
        <Card>
          <BlockTitle
            title={
              manuales.length === 1
                ? "1 teléfono hay que conseguirlo otra vez"
                : `${manuales.length} teléfonos hay que conseguirlos otra vez`
            }
            hint="Estos no se pueden deducir: falta información o sobra de más. Se corrigen pidiendo el número correcto y volviéndolo a cargar en la nómina del periodo."
          />

          <div className="flex flex-col gap-6">
            {ORDEN.filter((tipo) => (gruposManuales[tipo] ?? []).length > 0).map((tipo) => (
              <GrupoProblema
                key={tipo}
                tipo={tipo}
                filas={gruposManuales[tipo] ?? []}
                expandido={expandidos[`m-${tipo}`] ?? false}
                onExpandir={() => setExpandidos((p) => ({ ...p, [`m-${tipo}`]: true }))}
              />
            ))}
          </div>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center gap-4">
        <Button variant="secondary" onClick={recargar} disabled={corrigiendo}>
          Volver a revisar
        </Button>
        <ShortcutBar items={[{ key: "r", label: "Volver a revisar" }]} />
      </div>

      <ConfirmDialog
        open={confirmando}
        onClose={() => setConfirmando(false)}
        onConfirm={() => void corregir()}
        title={
          corregibles.length === 1
            ? "Corregir 1 teléfono"
            : `Corregir ${corregibles.length} teléfonos`
        }
        // Es una escritura masiva sobre el expediente de gente real: la frase
        // dice el número exacto, qué NO se toca y que no hay deshacer.
        consequence={`Se va a cambiar el teléfono guardado de ${corregibles.length} empleado${
          corregibles.length === 1 ? "" : "s"
        } por el formato que WhatsApp acepta. Los que no tienen corrección automática no se tocan. Esto no se puede deshacer desde aquí.`}
        confirmLabel={
          corregibles.length === 1 ? "Corregir 1 teléfono" : `Corregir ${corregibles.length} teléfonos`
        }
        loading={corrigiendo}
        // No es destructivo: repara datos. Pintarlo de rojo enseñaría a dudar
        // de la acción correcta.
        tone="primary"
      />
    </Stack>
  );
}

function agrupar(filas: Fila[]): Partial<Record<PhoneIssue, Fila[]>> {
  const grupos: Partial<Record<PhoneIssue, Fila[]>> = {};
  for (const f of filas) {
    (grupos[f.issue] ??= []).push(f);
  }
  return grupos;
}

/**
 * Un tipo de problema con su explicación y sus filas.
 *
 * Se pintan como mucho 20 filas y se ofrece ver el resto: con miles de
 * empleados, montar todo el DOM de golpe congela la pantalla justo cuando hay
 * más trabajo que hacer.
 */
function GrupoProblema({
  tipo,
  filas,
  mostrarCorreccion = false,
  expandido,
  onExpandir,
}: {
  tipo: Exclude<PhoneIssue, "ok">;
  filas: Fila[];
  mostrarCorreccion?: boolean;
  expandido: boolean;
  onExpandir: () => void;
}) {
  const info = PROBLEMAS[tipo];
  const visibles = expandido ? filas : filas.slice(0, POR_GRUPO);
  const ocultas = filas.length - visibles.length;

  return (
    <section>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-[19px] font-bold text-ink">{info.titulo}</h3>
        <span className="tabular text-[17px] font-bold text-ink-2">
          {filas.length} {filas.length === 1 ? "persona" : "personas"}
        </span>
      </div>
      <p className="mt-1 max-w-3xl text-[15px] leading-relaxed text-ink-3">{info.explicacion}</p>

      <ul className="mt-3 rounded-md bg-paper-deep px-4">
        {visibles.map((f) => (
          <li
            key={f.employee_id}
            className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-b border-line py-3 last:border-b-0"
          >
            <div className="min-w-0">
              <p className="truncate text-[17px] font-semibold text-ink">{nombreDe(f)}</p>
              {f.empleador ? (
                <p className="truncate text-[15px] text-ink-3">{f.empleador}</p>
              ) : null}
            </div>

            <div className="flex shrink-0 items-center gap-3 font-mono text-[17px]">
              <span className={f.telefono_normalizado ? "text-ink-2" : "text-ink-3"}>
                {f.telefono_normalizado || "sin número"}
              </span>
              {mostrarCorreccion && f.suggested_fix ? (
                <>
                  <span aria-hidden="true" className="text-ink-3">
                    →
                  </span>
                  <span className="font-bold text-done">{f.suggested_fix}</span>
                </>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      {ocultas > 0 ? (
        <div className="mt-3">
          <Button variant="quiet" size="sm" onClick={onExpandir}>
            Ver las {ocultas} restantes
          </Button>
        </div>
      ) : null}
    </section>
  );
}
