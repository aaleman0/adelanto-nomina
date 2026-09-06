"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Stack, Card, BlockTitle, Sunken } from "@/ui/surface";
import { Grid } from "@/ui/screen";
import { Button } from "@/ui/button";
import { Status, CountTile, type Tone } from "@/ui/status";
import { Empty, ErrorState, LoadingRows, ProblemNote } from "@/ui/states";
import { useToast } from "@/ui/toast";
import { pedirJson, cuerpoJson } from "./red";

/**
 * Plantillas aprobadas por Meta.
 *
 * Esta pantalla es de consulta: las plantillas se escriben y se aprueban en
 * Meta, aquí solo se ve el resultado. Por eso la única acción es sincronizar
 * (traer el estado real) y todo lo demás explica qué significa cada estado.
 */

type Componente = {
  type: string;
  format?: string;
  text?: string;
  buttons?: Array<{ type: string; text: string }>;
};

type Plantilla = {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
  components: Componente[];
  synced_at: string;
};

/** Traducción del estado de Meta al lenguaje de quien va a enviar. */
function describirEstado(status: string): { label: string; tone: Tone; sirve: boolean } {
  switch (status.toUpperCase()) {
    case "APPROVED":
      return { label: "Aprobada — se puede enviar", tone: "done", sirve: true };
    case "PENDING":
      return { label: "En revisión de Meta", tone: "progress", sirve: false };
    case "REJECTED":
      return { label: "Rechazada por Meta", tone: "failed", sirve: false };
    case "PAUSED":
      return { label: "Pausada por Meta", tone: "attention", sirve: false };
    case "DISABLED":
      return { label: "Desactivada", tone: "wait", sirve: false };
    default:
      return { label: status.replace(/_/g, " ").toLowerCase(), tone: "wait", sirve: false };
  }
}

/** Qué implica la categoría de Meta para la entrega. */
function describirCategoria(categoria: string): string {
  switch (categoria.toUpperCase()) {
    case "UTILITY":
      return "Utilidad: acompaña algo que el empleado ya pidió o ya tiene en curso.";
    case "MARKETING":
      return "Marketing: promoción. Meta la entrega con más restricciones que las de utilidad.";
    case "AUTHENTICATION":
      return "Autenticación: códigos de acceso.";
    default:
      return categoria;
  }
}

const FECHA = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatearFecha(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "Sin fecha" : FECHA.format(d);
}

/** Orden de lectura: primero lo que sirve para enviar, luego lo que no. */
const ORDEN: Record<string, number> = { APPROVED: 0, PENDING: 1, PAUSED: 2, REJECTED: 3, DISABLED: 4 };

export function ListaPlantillas() {
  const toast = useToast();
  /**
   * `plantillas === null` significa "todavía no llegó la respuesta": una lista
   * vacía es un resultado legítimo y distinto. Estar cargando se DEDUCE de eso
   * y del error, no se guarda: guardarlo obligaba a poner "loading" de forma
   * síncrona dentro del efecto, que es lo que encadena renders.
   */
  const [plantillas, setPlantillas] = useState<Plantilla[] | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [problema, setProblema] = useState<{ mensaje: string; detalle?: string } | null>(null);

  const cargando = plantillas === null && errorCarga === null;

  /**
   * Todos los setState quedan DESPUÉS del await, nunca en el arranque síncrono.
   * `vigente` deja descartar una respuesta que llegó tarde; por defecto se
   * aplica siempre, porque un reintento del operador sí quiere su resultado.
   */
  const cargar = useCallback(async (vigente: () => boolean = () => true) => {
    const r = await pedirJson<{ templates: Plantilla[] }>("/api/whatsapp/templates", {
      cache: "no-store",
    });
    if (!vigente()) return;
    if (!r.ok) {
      setErrorCarga(r.mensaje);
      return;
    }
    setErrorCarga(null);
    setPlantillas(r.datos.templates ?? []);
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

  async function sincronizar() {
    setSincronizando(true);
    setProblema(null);

    const r = await pedirJson<{ synced: number; templates?: Plantilla[] }>(
      "/api/whatsapp/templates/sync",
      cuerpoJson({}),
    );
    setSincronizando(false);

    if (!r.ok) {
      setProblema({ mensaje: r.mensaje, detalle: r.detalle });
      toast.failed("No se pudieron traer las plantillas de Meta.");
      return;
    }

    // El sync devuelve las plantillas ya guardadas; si vinieran vacías se
    // vuelve a leer para no dejar la pantalla mostrando datos viejos.
    if (r.datos.templates && r.datos.templates.length > 0) {
      setErrorCarga(null);
      setPlantillas(r.datos.templates);
    } else {
      await cargar();
    }

    toast.done(
      r.datos.synced === 1
        ? "Se actualizó 1 plantilla desde Meta."
        : `Se actualizaron ${r.datos.synced} plantillas desde Meta.`,
    );
  }

  const ordenadas = useMemo(
    () =>
      [...(plantillas ?? [])].sort((a, b) => {
        const oa = ORDEN[(a.status ?? "").toUpperCase()] ?? 9;
        const ob = ORDEN[(b.status ?? "").toUpperCase()] ?? 9;
        return oa !== ob ? oa - ob : a.name.localeCompare(b.name, "es");
      }),
    [plantillas],
  );

  const conteos = useMemo(() => {
    let aprobadas = 0;
    let enRevision = 0;
    let inservibles = 0;
    for (const p of plantillas ?? []) {
      const s = (p.status ?? "").toUpperCase();
      if (s === "APPROVED") aprobadas += 1;
      else if (s === "PENDING") enRevision += 1;
      else inservibles += 1;
    }
    return { aprobadas, enRevision, inservibles };
  }, [plantillas]);

  const botonSincronizar = (
    <Button
      variant="primary"
      size="lg"
      onClick={() => void sincronizar()}
      loading={sincronizando}
      loadingLabel="Trayendo de Meta…"
      icon={
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M20 12a8 8 0 11-2.3-5.6M20 4v4h-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      }
    >
      Sincronizar con Meta
    </Button>
  );

  if (cargando) return <LoadingRows rows={3} />;

  if (errorCarga !== null || plantillas === null) {
    return (
      <ErrorState
        title="No se pudieron leer las plantillas"
        hint={errorCarga ?? "Vuelve a intentarlo."}
        // Limpiar el error aquí, en el manejador del clic, es lo que devuelve
        // el esqueleto mientras se reintenta.
        onRetry={() => {
          setErrorCarga(null);
          void cargar();
        }}
      />
    );
  }

  return (
    <Stack>
      <Card>
        <BlockTitle
          title="Solo se puede enviar con una plantilla aprobada"
          hint="Meta revisa cada texto antes de permitir su envío. Las que no están aprobadas no salen, aunque aparezcan en esta lista. Si acabas de aprobar una en Meta, sincroniza para que aparezca aquí."
          // Sin plantillas, la invitación a sincronizar la da el estado vacío de
          // abajo. Montar el mismo botón grande en los dos sitios dejaba dos
          // acciones primarias idénticas, una encima de la otra.
          action={plantillas.length > 0 ? botonSincronizar : undefined}
        />

        {problema ? (
          <div className="mb-5">
            <ProblemNote>
              {problema.mensaje}
              {problema.detalle ? (
                <span className="mt-1 block text-[15px] font-normal opacity-80">
                  Lo que respondió Meta: {problema.detalle}
                </span>
              ) : null}
            </ProblemNote>
          </div>
        ) : null}

        {plantillas.length > 0 ? (
          <Grid cols="sm:grid-cols-3">
            <CountTile count={conteos.aprobadas} label="Aprobadas: se pueden enviar" tone="done" />
            <CountTile count={conteos.enRevision} label="En revisión de Meta" tone="progress" />
            <CountTile count={conteos.inservibles} label="No sirven para enviar" tone="failed" />
          </Grid>
        ) : null}
      </Card>

      {plantillas.length === 0 ? (
        <Empty
          title="Todavía no hay plantillas guardadas"
          hint="Las plantillas se escriben y se aprueban dentro de Meta. Cuando ya tengas alguna, tráela con el botón para poder usarla al enviar ofertas."
          action={botonSincronizar}
        />
      ) : (
        ordenadas.map((p) => {
          const est = describirEstado(p.status ?? "");
          const cuerpo = p.components?.find((c) => c.type?.toUpperCase() === "BODY")?.text ?? null;
          const botones =
            p.components?.find((c) => c.type?.toUpperCase() === "BUTTONS")?.buttons ?? [];

          return (
            <Card key={p.id} className={est.sirve ? "" : "opacity-90"}>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate font-mono text-[19px] font-bold text-ink">{p.name}</p>
                  <p className="mt-1 text-[15px] leading-snug text-ink-3">
                    {describirCategoria(p.category ?? "")} · Idioma {p.language}
                  </p>
                </div>
                <Status value={{ label: est.label, tone: est.tone }} />
              </div>

              {cuerpo ? (
                <Sunken>
                  <p className="text-[13px] font-semibold uppercase tracking-[0.07em] text-ink-3">
                    Lo que lee el empleado
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-[17px] leading-relaxed text-ink">
                    {cuerpo}
                  </p>
                </Sunken>
              ) : (
                <p className="text-[17px] text-ink-3">Esta plantilla no tiene texto de cuerpo.</p>
              )}

              {botones.length > 0 ? (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="text-[15px] font-semibold text-ink-2">Botones del mensaje:</span>
                  {botones.map((b, i) => (
                    <span
                      key={`${b.text}-${i}`}
                      className="inline-flex h-9 items-center rounded-full border border-line-strong bg-paper px-3.5 text-[15px] font-semibold text-ink-2"
                    >
                      {b.text}
                    </span>
                  ))}
                </div>
              ) : null}

              <p className="mt-4 text-[15px] text-ink-3">
                Última sincronización con Meta: {formatearFecha(p.synced_at)}
              </p>
            </Card>
          );
        })
      )}
    </Stack>
  );
}
