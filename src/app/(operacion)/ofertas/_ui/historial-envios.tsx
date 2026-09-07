"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Screen } from "@/ui/screen";
import { Card, Datum, Stack } from "@/ui/surface";
import { Button } from "@/ui/button";
import { SelectInput, TextInput } from "@/ui/field";
import { Status } from "@/ui/status";
import { Empty, ErrorState, LoadingRows } from "@/ui/states";
import { staggerChild, staggerParent } from "@/ui/motion";
import { EnlaceAccion } from "./paso";
import { Paginacion } from "./paginacion";
import { estadoDeEnvio, fechaHora, modoDeEnvio, pedirJson, type EnvioResumen } from "./formato";

type Respuesta = {
  data: EnvioResumen[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

const ESTADOS = [
  { valor: "", label: "Todos los estados" },
  { valor: "completed", label: "Terminados" },
  { valor: "sending", label: "Enviando" },
  { valor: "pending", label: "En espera" },
  { valor: "failed", label: "Fallidos" },
];

const MODOS = [
  { valor: "", label: "Todas las formas de envío" },
  { valor: "import", label: "Ciclo completo" },
  { valor: "manual", label: "Personas sueltas" },
  { valor: "status", label: "Por etapa del trabajo" },
];

/**
 * VER ENVÍOS ANTERIORES.
 *
 * Es la memoria de la operación: a quién se le mandó, cuándo y cómo salió. Los
 * filtros viven en la URL para que un envío raro se pueda compartir por chat
 * ("mira el del martes que falló") sin explicar qué hay que teclear.
 *
 * Nunca se muestra quién disparó el envío: la pantalla informa del estado del
 * trabajo, no del desempeño de la persona que lo operó.
 */
export function HistorialEnvios() {
  const router = useRouter();
  const params = useSearchParams();

  const pagina = Math.max(1, Number(params.get("pagina") ?? "1") || 1);
  const estado = params.get("estado") ?? "";
  const modo = params.get("modo") ?? "";
  const desde = params.get("desde") ?? "";
  const hasta = params.get("hasta") ?? "";

  const hayFiltros = estado !== "" || modo !== "" || desde !== "" || hasta !== "";

  const [intento, setIntento] = useState(0);

  // Identidad de la consulta vigente: lo cargado se guarda junto a la clave que
  // lo pidió. Al cambiar un filtro, la clave deja de coincidir y la lista vuelve
  // al esqueleto por comparación, en vez de limpiar estado dentro del efecto.
  const clave = `${pagina}|${estado}|${modo}|${desde}|${hasta}|${intento}`;

  const [carga, setCarga] = useState<{
    clave: string;
    datos: Respuesta | null;
    fallo: string | null;
  } | null>(null);

  const vigente = carga?.clave === clave ? carga : null;
  const datos = vigente?.datos ?? null;
  const fallo = vigente?.fallo ?? null;

  useEffect(() => {
    let activo = true;

    const consulta = new URLSearchParams({ page: String(pagina), pageSize: "20" });
    if (estado) consulta.set("status", estado);
    if (modo) consulta.set("mode", modo);
    if (desde) consulta.set("dateFrom", desde);
    if (hasta) consulta.set("dateTo", hasta);

    pedirJson<Respuesta>(`/api/whatsapp/bulk/history?${consulta.toString()}`)
      .then((r) => {
        if (activo) setCarga({ clave, datos: r, fallo: null });
      })
      .catch((e: Error) => {
        if (activo) setCarga({ clave, datos: null, fallo: e.message });
      });

    return () => {
      activo = false;
    };
  }, [clave, pagina, estado, modo, desde, hasta]);

  /** Todo cambio de filtro vuelve a la página 1: seguir en la 7 tras filtrar deja la lista vacía. */
  const cambiarFiltro = useCallback(
    (cambios: Record<string, string>) => {
      const siguiente = new URLSearchParams(params.toString());
      for (const [clave, valor] of Object.entries(cambios)) {
        if (valor) siguiente.set(clave, valor);
        else siguiente.delete(clave);
      }
      if (!("pagina" in cambios)) siguiente.delete("pagina");
      const qs = siguiente.toString();
      router.push(qs ? `/ofertas/historial?${qs}` : "/ofertas/historial", { scroll: false });
    },
    [params, router],
  );

  return (
    <Screen
      title="Envíos anteriores"
      lead="Cada vez que se manda una tanda de ofertas queda registrada aquí, con cómo le fue a cada mensaje."
      back={{ href: "/ofertas", label: "Volver a enviar ofertas" }}
      action={<EnlaceAccion href="/ofertas" tono="primary">Enviar ofertas</EnlaceAccion>}
    >
      <Stack gap="gap-5">
        <Card>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SelectInput
              label="Cómo terminó"
              value={estado}
              onChange={(e) => cambiarFiltro({ estado: e.target.value })}
            >
              {ESTADOS.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.label}
                </option>
              ))}
            </SelectInput>

            <SelectInput
              label="Cómo se eligió a quién"
              value={modo}
              onChange={(e) => cambiarFiltro({ modo: e.target.value })}
            >
              {MODOS.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.label}
                </option>
              ))}
            </SelectInput>

            <TextInput
              label="Desde el día"
              type="date"
              value={desde}
              onChange={(e) => cambiarFiltro({ desde: e.target.value })}
            />

            <TextInput
              label="Hasta el día"
              type="date"
              hint="Incluye ese día completo."
              value={hasta}
              onChange={(e) => cambiarFiltro({ hasta: e.target.value })}
            />
          </div>

          {hayFiltros ? (
            <div className="mt-4">
              <Button
                variant="quiet"
                size="sm"
                onClick={() => router.push("/ofertas/historial", { scroll: false })}
              >
                Quitar los filtros
              </Button>
            </div>
          ) : null}
        </Card>

        {fallo ? (
          <ErrorState
            title="No se pudo cargar el historial"
            hint={fallo}
            onRetry={() => setIntento((n) => n + 1)}
            retryLabel="Volver a cargar el historial"
          />
        ) : datos === null ? (
          <LoadingRows rows={5} />
        ) : datos.data.length === 0 ? (
          <Empty
            title={hayFiltros ? "Ningún envío coincide con estos filtros" : "Todavía no se ha enviado nada"}
            hint={
              hayFiltros
                ? "Prueba con un rango de fechas más amplio o quita el filtro de estado."
                : "Cuando mandes la primera tanda de ofertas, va a aparecer aquí con el detalle de cada mensaje."
            }
            action={
              hayFiltros ? (
                <Button variant="secondary" size="lg" onClick={() => router.push("/ofertas/historial")}>
                  Quitar los filtros
                </Button>
              ) : (
                <EnlaceAccion href="/ofertas" tono="primary">
                  Enviar las primeras ofertas
                </EnlaceAccion>
              )
            }
          />
        ) : (
          <>
            <motion.ul
              variants={staggerParent}
              initial="initial"
              animate="animate"
              className="flex flex-col gap-4"
            >
              {datos.data.map((envio) => (
                <motion.li key={envio.id} variants={staggerChild}>
                  <Link
                    href={`/ofertas/${envio.id}`}
                    className="block rounded-lg bg-surface p-6 shadow-1 outline-none transition-shadow duration-[160ms] hover:shadow-2 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-action"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-[19px] font-bold leading-tight text-ink">
                          {fechaHora(envio.created_at)}
                        </p>
                        <p className="mt-1 text-[15px] text-ink-3">{modoDeEnvio(envio.mode)}</p>
                      </div>
                      <Status value={estadoDeEnvio(envio.status)} />
                    </div>

                    <div className="mt-5 grid gap-4 sm:grid-cols-3">
                      <Datum label="Podían recibirlo" value={envio.eligible_count ?? 0} tone="strong" />
                      <Datum label="Mensajes que salieron" value={envio.sent_count ?? 0} tone="strong" />
                      <Datum
                        label="No se pudieron enviar"
                        value={
                          <span className={(envio.failed_count ?? 0) > 0 ? "text-failed" : undefined}>
                            {envio.failed_count ?? 0}
                          </span>
                        }
                        tone="strong"
                      />
                    </div>
                  </Link>
                </motion.li>
              ))}
            </motion.ul>

            <Paginacion
              pagina={datos.page}
              totalPaginas={datos.totalPages}
              total={datos.total}
              unidad="envíos"
              onIr={(p) => cambiarFiltro({ pagina: String(p) })}
            />
          </>
        )}
      </Stack>
    </Screen>
  );
}
