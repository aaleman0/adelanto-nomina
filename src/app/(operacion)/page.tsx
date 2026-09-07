import Link from "next/link";
import {
  getActionQueue,
  getDashboardKpis,
  type ContractControlRow,
  type ContractOperationalStatus,
  type ExpiringLinkRow,
} from "@/lib/backoffice/contract-control";
import { getCurrentActor, hasRole } from "@/lib/auth/roles";
import { Screen } from "@/ui/screen";
import { ActionLink } from "@/ui/button";
import { Card, Stack } from "@/ui/surface";
import { Status } from "@/ui/status";
import { Empty, ProblemNote } from "@/ui/states";
import { Key } from "@/ui/shortcuts";
import { AmbitoDeAtajos, AtajosPendientes } from "./_pendientes/atajos";
import { AccionEnLote } from "./_pendientes/accion-en-lote";

/** La cola cambia con cada acción del operador: nunca se sirve de caché. */
export const dynamic = "force-dynamic";

/** Cuántos expedientes se traen a esta pantalla. El resto se dice en pantalla. */
const TOPE_DE_LISTA = 50;

export default async function PantallaPendientes() {
  // Se piden por separado para que un fallo del bloque secundario (los enlaces
  // por vencer) no tire la pantalla entera: la cola es la tarea, lo demás es
  // contexto. Si falla la cola sí se relanza, y la atrapa error.tsx del grupo.
  const [colaResultado, kpisResultado, actor] = await Promise.all([
    getActionQueue(TOPE_DE_LISTA).then(
      (v) => ({ ok: true as const, v }),
      (e: unknown) => ({ ok: false as const, e }),
    ),
    getDashboardKpis().then(
      (v) => ({ ok: true as const, v }),
      () => ({ ok: false as const, v: null }),
    ),
    getCurrentActor().catch(() => null),
  ]);

  if (!colaResultado.ok) throw colaResultado.e;

  const { rows, total } = colaResultado.v;
  const kpis = kpisResultado.ok ? kpisResultado.v : null;
  const puedeOperar = hasRole(actor?.role ?? "solo_lectura", "operaciones");

  const filasPorEstado = agruparPorEstado(rows);

  // La cola se llena POR PRIORIDAD (primero los errores, luego los vencidos,
  // luego los pendientes). Si se alcanzó el tope, el último grupo con filas
  // quedó cortado y los siguientes ni siquiera se alcanzaron a leer: de ahí
  // en adelante los conteos son un mínimo, no la cifra real. Decirlo es
  // obligatorio; presentar "0 sin enviar" cuando podría haber cientos sería
  // mentir con la interfaz.
  const listaRecortada = total > rows.length;
  const ultimoGrupoConFilas = GRUPOS.reduce(
    (indice, grupo, i) => ((filasPorEstado.get(grupo.estado)?.length ?? 0) > 0 ? i : indice),
    -1,
  );

  return (
    <Screen
      title="Pendientes"
      lead="Los expedientes donde el sistema te está esperando a ti. De arriba abajo, lo más urgente primero."
      action={
        <ActionLink href="/ofertas" size="lg">
          Enviar ofertas <Key tone="dark">o</Key>
        </ActionLink>
      }
    >
      {/* Mientras haya un diálogo abierto dentro de este ámbito, los atajos de
          navegación del pie se apagan solos (ver _pendientes/atajos.tsx): una
          tecla no debe sacar al operador de una confirmación sin contestar. */}
      <AmbitoDeAtajos>
        {total === 0 ? (
          <Empty
            title="No hay nada pendiente"
            hint="Ningún expediente está esperando algo de ti ahora mismo. Cuando llegue el siguiente periodo, carga el archivo de nómina y vuelve aquí."
            action={
              <ActionLink href="/nomina" size="lg">
                Cargar nómina del periodo
              </ActionLink>
            }
          />
        ) : (
          <div className="flex flex-col gap-4">
            {listaRecortada ? (
              <p className="rounded-md bg-paper-deep px-5 py-3.5 text-[15px] leading-snug text-ink-2">
                Mostrando <b className="tabular text-ink">{rows.length}</b> de{" "}
                <b className="tabular text-ink">{total}</b> expedientes por resolver. Los conteos marcados con{" "}
                <b className="text-ink">+</b> son un mínimo: los que faltan aparecen conforme resuelvas estos.
              </p>
            ) : null}

            <Stack>
              {GRUPOS.map((grupo, i) => {
                const filas = filasPorEstado.get(grupo.estado) ?? [];
                // Todo lo que quede del corte hacia abajo puede tener más de lo que se ve.
                const incompleto = listaRecortada && i >= Math.max(0, ultimoGrupoConFilas);

                return (
                  <Card key={grupo.estado}>
                    <div className="mb-5 flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
                      <div className="flex min-w-0 items-start gap-4">
                        <span className={`text-[31px] font-bold leading-none tabular ${grupo.color}`}>
                          {filas.length}
                          {incompleto ? "+" : ""}
                        </span>
                        <div className="min-w-0">
                          <h2 className="text-[23px] font-bold leading-tight text-ink">{grupo.titulo}</h2>
                          <p className="mt-1 max-w-xl text-[15px] leading-snug text-ink-3">{grupo.pista}</p>
                        </div>
                      </div>

                      <div className="shrink-0">
                        {grupo.estado === "pendiente_envio" ? (
                          <ActionLink href="/ofertas" variant="secondary">
                            Ir a enviar ofertas
                          </ActionLink>
                        ) : (
                          <AccionEnLote
                            estado={grupo.estado === "error" ? "error" : "link_expirado"}
                            habilitado={filas.length > 0 || incompleto}
                            puedeOperar={puedeOperar}
                          />
                        )}
                      </div>
                    </div>

                    {filas.length === 0 ? (
                      <p className="text-[17px] text-ink-3">
                        {incompleto
                          ? "Todavía no caben en esta lista. Aparecerán cuando resuelvas los grupos de arriba."
                          : "Ninguno ahora mismo."}
                      </p>
                    ) : (
                      <ul className="-mx-2 divide-y divide-line">
                        {filas.map((fila) => (
                          <li key={fila.employee_id}>
                            <FilaExpediente fila={fila} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                );
              })}
            </Stack>
          </div>
        )}

        <div className="mt-8">
          <Stack>
            <Card>
              <div className="mb-5">
                <h2 className="text-[23px] font-bold leading-tight text-ink">Enlaces que vencen pronto</h2>
                <p className="mt-1 max-w-2xl text-[15px] leading-snug text-ink-3">
                  Enlaces de firma con menos de 24 horas de plazo. Incluye también a quienes ya firmaron: este dato
                  no los separa, así que abre el expediente antes de volver a avisarle a alguien.
                </p>
              </div>

              {kpis === null ? (
                <ProblemNote>
                  No se pudo leer esta parte. Lo de arriba sí está al día; vuelve a cargar la pantalla para ver los
                  enlaces por vencer.
                </ProblemNote>
              ) : kpis.expiringLinks.length === 0 ? (
                <p className="text-[17px] text-ink-3">Ningún enlace vence en las próximas 24 horas.</p>
              ) : (
                <ul className="-mx-2 divide-y divide-line">
                  {kpis.expiringLinks.map((enlace) => (
                    <li key={`${enlace.employee_id}-${enlace.link_expires_at}`}>
                      <FilaEnlacePorVencer enlace={enlace} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </Stack>
        </div>

        <div className="mt-8 flex flex-col gap-4">
          {kpis ? (
            <p className="text-[15px] text-ink-3">
              En todo el sistema hay <b className="tabular text-ink">{kpis.totalElegibles}</b> expedientes elegibles
              y <b className="tabular text-ink">{kpis.firmados}</b> ya firmados.
            </p>
          ) : null}
          <AtajosPendientes />
        </div>
      </AmbitoDeAtajos>
    </Screen>
  );
}

/**
 * Una fila de la cola. Toda la fila es el enlace al expediente (objetivo de
 * clic amplio), y aun así lleva el texto "Abrir expediente" visible: el
 * operador no tiene que adivinar que la fila es pulsable.
 *
 * La etiqueta se arma con el estado CRUDO del expediente: `<Status>` ya
 * traduce los nueve valores de `operational_status`, así que esta pantalla no
 * inventa su propia versión y el mismo estado se lee igual en todo el sistema.
 */
function FilaExpediente({ fila }: { fila: ContractControlRow }) {
  return (
    <Link
      href={`/personas/${fila.employee_id}`}
      className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md px-2 py-4 hover:bg-paper-deep focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-action"
    >
      <span className="min-w-0 flex-1 basis-64">
        <span className="block truncate text-[19px] font-semibold text-ink">{nombreDe(fila)}</span>
        <span className="block truncate text-[15px] text-ink-3">{fila.empleador ?? "Sin empleador registrado"}</span>
      </span>
      <span className="shrink-0 text-[17px] font-semibold tabular text-ink">{formatearMonto(fila.monto_prestamo_autorizado)}</span>
      <Status value={fila.operational_status} size="sm" />
      <span className="inline-flex shrink-0 items-center gap-1.5 text-[17px] font-semibold text-action">
        Abrir expediente
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
          <path d="M10 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </Link>
  );
}

function FilaEnlacePorVencer({ enlace }: { enlace: ExpiringLinkRow }) {
  return (
    <Link
      href={`/personas/${enlace.employee_id}`}
      className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md px-2 py-4 hover:bg-paper-deep focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-action"
    >
      <span className="min-w-0 flex-1 basis-64">
        <span className="block truncate text-[19px] font-semibold text-ink">
          {enlace.empleado?.trim() || "Sin nombre registrado"}
        </span>
        <span className="block truncate text-[15px] text-ink-3">{enlace.empleador ?? "Sin empleador registrado"}</span>
      </span>
      <span className="shrink-0 text-[17px] font-semibold tabular text-ink">
        {formatearMonto(enlace.monto_prestamo_autorizado)}
      </span>
      <span className="shrink-0 text-[17px] text-ink-2">
        Vence el <b className="font-semibold tabular text-ink">{formatearVencimiento(enlace.link_expires_at)}</b>
      </span>
    </Link>
  );
}

type Grupo = {
  estado: ContractOperationalStatus;
  titulo: string;
  /** Qué significa el grupo y qué se hace con él, en lenguaje de operador. */
  pista: string;
  color: string;
};

/** Orden de urgencia. Es el mismo de ACTION_REQUIRED_STATUSES: no se reordena. */
const GRUPOS: Grupo[] = [
  {
    estado: "error",
    titulo: "Con error",
    pista: "El contrato no se pudo generar. Reintenta; si vuelve a fallar, abre el expediente para ver qué contestó el sistema.",
    color: "text-failed",
  },
  {
    estado: "link_expirado",
    titulo: "Enlace vencido",
    pista: "Se les acabó el plazo para firmar. Genera un enlace nuevo y vuelve a avisarles por WhatsApp.",
    color: "text-attention",
  },
  {
    estado: "pendiente_envio",
    titulo: "Sin enviar",
    pista: "Son elegibles y todavía no reciben su oferta. Se envían desde Ofertas, en un solo movimiento.",
    color: "text-ink-2",
  },
];

function agruparPorEstado(rows: ContractControlRow[]) {
  const mapa = new Map<ContractOperationalStatus, ContractControlRow[]>();
  for (const fila of rows) {
    const grupo = mapa.get(fila.operational_status);
    if (grupo) grupo.push(fila);
    else mapa.set(fila.operational_status, [fila]);
  }
  return mapa;
}

function nombreDe(fila: ContractControlRow): string {
  const compuesto = [fila.nombre, fila.apellidos].filter(Boolean).join(" ").trim();
  return fila.empleado?.trim() || compuesto || "Sin nombre registrado";
}

const MONTO = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatearMonto(monto: number | null): string {
  if (monto === null) return "Sin monto";
  return MONTO.format(monto);
}

/**
 * Vencimiento en hora de Ciudad de México, con día explícito: "vence a las
 * 6 p.m." es ambiguo cuando el plazo cae de madrugada del día siguiente.
 * Se formatea una fecha fija (nunca `Date.now()`), así el render es puro.
 */
const VENCIMIENTO = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Mexico_City",
});

function formatearVencimiento(iso: string): string {
  return VENCIMIENTO.format(new Date(iso));
}
