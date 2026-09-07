"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Screen, Grid } from "@/ui/screen";
import { Card, Stack, Sunken } from "@/ui/surface";
import { Button } from "@/ui/button";
import { SearchInput, SelectInput } from "@/ui/field";
import { CountTile, Status } from "@/ui/status";
import { Empty, ErrorState, LoadingRows, LoadingTiles, ProblemNote } from "@/ui/states";
import { staggerChild, staggerParent } from "@/ui/motion";
import { EnlaceAccion } from "./paso";
import { Paginacion } from "./paginacion";
import {
  estadoDeEntrega,
  estadoDeEnvio,
  fechaHora,
  modoDeEnvio,
  nombreCompleto,
  pedirJson,
  type EnvioResumen,
  type MensajeEnviado,
} from "./formato";

type Respuesta = {
  bulkSend: EnvioResumen;
  messages: MensajeEnviado[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

/**
 * Cómo terminó cada mensaje, del más avanzado al que ni ha salido.
 *
 * `queued` no es un valor de la columna: el mensaje recién encolado tiene
 * `delivery_status` en NULL hasta que el trabajador de fondo lo toma, y el
 * endpoint traduce ese valor a "sin estado todavía". Sin estas dos últimas
 * opciones no se podía aislar justo el caso al que manda el mensaje de éxito
 * después de encolar un envío.
 */
const ENTREGAS = [
  { valor: "", label: "Todos los mensajes" },
  { valor: "read", label: "Los que ya leyó" },
  { valor: "delivered", label: "Los que le llegaron" },
  { valor: "sent", label: "Los que salieron" },
  { valor: "failed", label: "Los que fallaron" },
  { valor: "pending", label: "Los que todavía no salen" },
  { valor: "queued", label: "Los que están en cola" },
];

/**
 * VER UN ENVÍO — mensaje por mensaje.
 *
 * Aquí se viene con una pregunta concreta ("¿a Fulano le llegó?"), así que lo
 * primero es el buscador por RFC y el filtro por cómo terminó cada mensaje.
 *
 * A diferencia de la pantalla vieja, el motivo del fallo se muestra en la
 * propia fila: era el dato que el operador necesitaba para decidir si corrige
 * el teléfono o si el problema es de WhatsApp, y obligaba a pedirlo a soporte.
 */
export function DetalleEnvio({ envioId }: { envioId: string }) {
  const router = useRouter();
  const params = useSearchParams();

  const pagina = Math.max(1, Number(params.get("pagina") ?? "1") || 1);
  const entrega = params.get("entrega") ?? "";
  const rfc = params.get("rfc") ?? "";

  const [intento, setIntento] = useState(0);
  const [texto, setTexto] = useState(rfc);

  // Identidad de la consulta vigente. Lo cargado se guarda junto a la clave que
  // lo pidió: si el operador cambia de página o de filtro, esa clave ya no
  // coincide y la pantalla vuelve al esqueleto por comparación, sin que el
  // efecto tenga que limpiar estado (lo que provocaba renders en cascada).
  const clave = `${envioId}|${pagina}|${entrega}|${rfc}|${intento}`;

  const [carga, setCarga] = useState<{
    clave: string;
    datos: Respuesta | null;
    fallo: string | null;
  } | null>(null);

  const vigente = carga?.clave === clave ? carga : null;
  const datos = vigente?.datos ?? null;
  const fallo = vigente?.fallo ?? null;

  const hayFiltros = entrega !== "" || rfc !== "";

  const cambiarFiltro = useCallback(
    (cambios: Record<string, string>) => {
      const siguiente = new URLSearchParams(params.toString());
      for (const [clave, valor] of Object.entries(cambios)) {
        if (valor) siguiente.set(clave, valor);
        else siguiente.delete(clave);
      }
      if (!("pagina" in cambios)) siguiente.delete("pagina");
      const qs = siguiente.toString();
      router.push(qs ? `/ofertas/${envioId}?${qs}` : `/ofertas/${envioId}`, { scroll: false });
    },
    [params, router, envioId],
  );

  // El buscador escribe en la URL con retraso: un push por tecla llenaría el
  // historial del navegador y dispararía una consulta por letra.
  useEffect(() => {
    const limpio = texto.trim();
    if (limpio === rfc) return;
    const temporizador = setTimeout(() => cambiarFiltro({ rfc: limpio }), 350);
    return () => clearTimeout(temporizador);
  }, [texto, rfc, cambiarFiltro]);

  useEffect(() => {
    let activo = true;

    const consulta = new URLSearchParams({ id: envioId, page: String(pagina), pageSize: "50" });
    if (entrega) consulta.set("status", entrega);
    if (rfc) consulta.set("q", rfc);

    pedirJson<Respuesta>(`/api/whatsapp/bulk/detail?${consulta.toString()}`)
      .then((r) => {
        if (activo) setCarga({ clave, datos: r, fallo: null });
      })
      .catch((e: Error) => {
        if (activo) setCarga({ clave, datos: null, fallo: e.message });
      });

    return () => {
      activo = false;
    };
  }, [clave, envioId, pagina, entrega, rfc]);

  const envio = datos?.bulkSend;

  return (
    <Screen
      title="Cómo le fue a este envío"
      lead="Mensaje por mensaje: a quién le llegó, quién lo leyó y por qué falló el resto."
      back={{ href: "/ofertas/historial", label: "Volver a los envíos anteriores" }}
      action={<EnlaceAccion href="/ofertas" tono="primary">Enviar ofertas</EnlaceAccion>}
    >
      <Stack gap="gap-5">
        {fallo ? (
          <ErrorState
            title="No se pudo abrir este envío"
            hint={fallo}
            onRetry={() => setIntento((n) => n + 1)}
            retryLabel="Volver a intentar"
          />
        ) : (
          <>
            {/* Cabecera: de qué envío estamos hablando y cómo quedó en total. */}
            {envio ? (
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[23px] font-bold leading-tight text-ink">
                      {fechaHora(envio.created_at)}
                    </p>
                    <p className="mt-1 text-[15px] text-ink-3">
                      {modoDeEnvio(envio.mode)}
                      {envio.mode === "import" && envio.import_id ? " · salió de una carga de nómina" : ""}
                    </p>
                  </div>
                  <Status value={estadoDeEnvio(envio.status)} />
                </div>

                <div className="mt-6">
                  <Grid cols="sm:grid-cols-2 xl:grid-cols-5">
                    <CountTile count={envio.eligible_count ?? 0} label="Podían recibirlo" tone="wait" />
                    <CountTile count={envio.sent_count ?? 0} label="Mensajes que salieron" tone="progress" />
                    <CountTile count={envio.delivered_count ?? 0} label="Les llegó" tone="done" />
                    <CountTile count={envio.read_count ?? 0} label="Lo leyeron" tone="done" />
                    <CountTile count={envio.failed_count ?? 0} label="No se pudieron enviar" tone="failed" />
                  </Grid>
                </div>

                {envio.error_summary ? (
                  <div className="mt-5">
                    <ProblemNote>{envio.error_summary}</ProblemNote>
                  </div>
                ) : null}
              </Card>
            ) : (
              <LoadingTiles tiles={5} />
            )}

            {/* Filtros de la lista */}
            <Card>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <span className="text-[15px] font-bold text-ink">Buscar por RFC</span>
                  <SearchInput
                    value={texto}
                    onChange={setTexto}
                    placeholder="Escribe el RFC de la persona"
                  />
                </div>

                <SelectInput
                  label="Cómo terminó el mensaje"
                  value={entrega}
                  onChange={(e) => cambiarFiltro({ entrega: e.target.value })}
                >
                  {ENTREGAS.map((o) => (
                    <option key={o.valor} value={o.valor}>
                      {o.label}
                    </option>
                  ))}
                </SelectInput>
              </div>

              {hayFiltros ? (
                <div className="mt-4">
                  <Button
                    variant="quiet"
                    size="sm"
                    onClick={() => {
                      setTexto("");
                      router.push(`/ofertas/${envioId}`, { scroll: false });
                    }}
                  >
                    Quitar los filtros
                  </Button>
                </div>
              ) : null}
            </Card>

            {datos === null ? (
              <LoadingRows rows={6} />
            ) : datos.messages.length === 0 ? (
              <Empty
                title={hayFiltros ? "Ningún mensaje coincide con lo que buscas" : "Este envío no tiene mensajes"}
                hint={
                  hayFiltros
                    ? "Revisa cómo escribiste el RFC o quita el filtro de estado."
                    : "Si el envío acaba de salir, los mensajes pueden tardar unos segundos en aparecer. Vuelve a cargar en un momento."
                }
                action={
                  hayFiltros ? (
                    <Button
                      variant="secondary"
                      size="lg"
                      onClick={() => {
                        setTexto("");
                        router.push(`/ofertas/${envioId}`, { scroll: false });
                      }}
                    >
                      Quitar los filtros
                    </Button>
                  ) : (
                    <Button variant="secondary" size="lg" onClick={() => setIntento((n) => n + 1)}>
                      Volver a cargar los mensajes
                    </Button>
                  )
                }
              />
            ) : (
              <>
                <motion.ul
                  variants={staggerParent}
                  initial="initial"
                  animate="animate"
                  className="flex flex-col gap-3"
                >
                  {datos.messages.map((m) => (
                    <motion.li
                      key={m.id}
                      variants={staggerChild}
                      className="rounded-lg bg-surface p-5 shadow-1"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0">
                          <Link
                            href={`/personas/${m.employee_id}`}
                            className="text-[19px] font-bold leading-tight text-ink underline-offset-4 outline-none hover:text-action hover:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-action"
                          >
                            {nombreCompleto(m)}
                          </Link>
                          <p className="mt-1 text-[15px] text-ink-3">
                            <span className="font-mono">{m.rfc ?? "Sin RFC"}</span>
                            {" · "}
                            {m.telefono?.trim() ? (
                              <span className="font-mono">{m.telefono}</span>
                            ) : (
                              <span className="font-semibold text-failed">Sin teléfono</span>
                            )}
                            {" · "}
                            {fechaHora(m.created_at)}
                          </p>
                        </div>
                        {/* Sin traducir, un mensaje encolado (delivery_status
                            en NULL) se leía como "Sin estado". */}
                        <Status value={estadoDeEntrega(m.delivery_status)} />
                      </div>

                      {m.error_message ? (
                        <Sunken className="mt-4">
                          <p className="text-[13px] font-bold uppercase tracking-[0.07em] text-ink-3">
                            Por qué no salió
                          </p>
                          <p className="mt-1 text-[17px] leading-snug text-ink">{m.error_message}</p>
                        </Sunken>
                      ) : null}
                    </motion.li>
                  ))}
                </motion.ul>

                <Paginacion
                  pagina={datos.page}
                  totalPaginas={datos.totalPages}
                  total={datos.total}
                  unidad="mensajes"
                  onIr={(p) => cambiarFiltro({ pagina: String(p) })}
                />
              </>
            )}
          </>
        )}
      </Stack>
    </Screen>
  );
}
