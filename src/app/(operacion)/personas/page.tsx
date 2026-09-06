import type { ReactNode } from "react";
import Link from "next/link";
import { Screen } from "@/ui/screen";
import { Card, Datum, Stack, Sunken } from "@/ui/surface";
import { Status } from "@/ui/status";
import { Empty } from "@/ui/states";
import { ShortcutBar } from "@/ui/shortcuts";
import {
  getContractControlData,
  parseContractOperationalStatus,
  parsePageParam,
  type ContractControlData,
  type ContractControlRow,
} from "@/lib/backoffice/contract-control";
import { Buscador } from "./_ui/buscador";
import { Contadores } from "./_ui/contadores";
import { ErrorRecargable } from "./_ui/error-recargable";
import { fecha, nombreDe, pesos } from "./_ui/vocabulario";

// El estado del trabajo cambia todo el día: nunca se sirve una copia en caché.
export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{
    q?: string;
    status?: string;
    empleador?: string;
    page?: string;
  }>;
};

export default async function PersonasPage({ searchParams }: Props) {
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const status = parseContractOperationalStatus(params.status);
  const empleador = (params.empleador ?? "").trim();
  const page = parsePageParam(params.page);

  let datos: ContractControlData;
  try {
    datos = await getContractControlData({
      q: q || undefined,
      status,
      empleador: empleador || undefined,
      page,
    });
  } catch {
    // El detalle técnico ya viajó al log del servidor; aquí solo qué hacer.
    return (
      <Screen title="Personas" lead="Encuentra a un empleado y abre su expediente.">
        <ErrorRecargable
          title="No se pudo cargar la lista de personas"
          hint="Fue un problema del sistema al leer los expedientes. Vuelve a intentarlo; si sigue igual, avisa a soporte."
        />
      </Screen>
    );
  }

  const hayFiltro = Boolean(q || empleador || status !== "all");

  return (
    <Screen
      title="Personas"
      lead="Encuentra a un empleado y abre su expediente para ver y mover su contrato."
    >
      <Stack gap="gap-8">
        <Buscador q={q} status={status} empleador={empleador} empleadores={datos.empleadores}>
          <Stack gap="gap-8">
            <Contadores metrics={datos.metrics} status={status} q={q} empleador={empleador} />

            <section aria-label="Resultados">
              {/* El encabezado solo aparece si hay algo que contar: con la lista
                  vacía el mensaje lo da el bloque de vacío, no un "0". */}
              {datos.rows.length > 0 ? (
                <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
                  <h2 className="text-[23px] font-bold leading-tight text-ink">
                    {datos.total === 1 ? "1 expediente" : `${datos.total} expedientes`}
                  </h2>
                  {datos.totalPages > 1 ? (
                    <p className="text-[15px] text-ink-3">
                      Página {datos.page} de {datos.totalPages} · {datos.limit} por página
                    </p>
                  ) : null}
                </div>
              ) : null}

              {datos.rows.length === 0 ? (
                hayFiltro ? (
                  <Empty
                    title="Nadie coincide con lo que buscas"
                    hint="Prueba con menos filtros, o escribe solo una parte del nombre o del RFC."
                    action={<EnlaceBoton href="/personas">Quitar los filtros</EnlaceBoton>}
                  />
                ) : (
                  <Empty
                    title="Todavía no hay personas"
                    hint="Los empleados aparecen aquí en cuanto aplicas el archivo de nómina del periodo."
                    action={<EnlaceBoton href="/nomina">Cargar la nómina</EnlaceBoton>}
                  />
                )
              ) : (
                <Stack gap="gap-4">
                  {datos.rows.map((row) => (
                    <FilaPersona key={row.employee_id} row={row} />
                  ))}
                </Stack>
              )}
            </section>

            {datos.totalPages > 1 ? (
              <Paginacion
                page={datos.page}
                totalPages={datos.totalPages}
                q={q}
                status={status === "all" ? "" : status}
                empleador={empleador}
              />
            ) : null}
          </Stack>
        </Buscador>

        {/* El atajo es global (lo registra el Shell) y siempre aterriza en esta
            pantalla con la búsqueda limpia: se anuncia como lo que hace. */}
        <ShortcutBar items={[{ key: "/", label: "Empezar una búsqueda nueva" }]} />
      </Stack>
    </Screen>
  );
}

/**
 * Un resultado = un bloque amplio, no una fila de tabla. En piso se lee de un
 * vistazo quién es, cuánto trae y en qué punto va, sin cruzar columnas
 * estrechas con la vista.
 */
function FilaPersona({ row }: { row: ContractControlRow }) {
  const href = `/personas/${row.employee_id}`;
  const nombre = nombreDe(row);

  return (
    <Card as="article">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0">
          <h3 className="text-[23px] font-bold leading-tight text-ink">
            <Link
              href={href}
              className="rounded-xs hover:text-action focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-action"
            >
              {nombre}
            </Link>
          </h3>
          <p className="mt-1.5 text-[15px] text-ink-3">
            Último movimiento: {fecha(row.last_movement_at, "sin movimientos")}
          </p>
        </div>
        {/* El estado va crudo: quien lo traduce es <Status>, para que se llame
            igual aquí, en el expediente y en el resto del sistema. */}
        <Status value={row.operational_status} />
      </div>

      <Sunken className="mt-5">
        <div className="grid gap-5 sm:grid-cols-3">
          <Datum label="RFC" value={row.rfc ?? "Sin RFC"} mono />
          <Datum label="Empleador" value={row.empleador ?? "Sin empleador"} />
          <Datum label="Monto autorizado" value={pesos(row.monto_prestamo_autorizado)} />
        </div>
      </Sunken>

      <div className="mt-5">
        {/* El nombre solo va en el `aria-label`: en pantalla el texto corto se
            escanea mejor, y quien navega con lector no oye 50 "Abrir el
            expediente" idénticos sin saber de quién. */}
        <EnlaceBoton href={href} aria-label={`Abrir el expediente de ${nombre}`}>
          Abrir el expediente
        </EnlaceBoton>
      </div>
    </Card>
  );
}

/**
 * Enlace con peso de botón. Es un `<a>` de verdad y no un botón con `onClick`:
 * abre en pestaña nueva con el clic central y se puede copiar, que es como se
 * trabaja un expediente al lado de la lista.
 */
function EnlaceBoton({
  href,
  children,
  "aria-label": ariaLabel,
}: {
  href: string;
  children: ReactNode;
  "aria-label"?: string;
}) {
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      className="inline-flex h-14 items-center justify-center gap-2.5 rounded-md border-2 border-action-line bg-action-soft px-7 text-[19px] font-semibold text-action transition-colors duration-[160ms] hover:bg-action hover:text-white focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-action"
    >
      {children}
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
        <path d="M10 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );
}

function Paginacion({
  page,
  totalPages,
  q,
  status,
  empleador,
}: {
  page: number;
  totalPages: number;
  q: string;
  status: string;
  empleador: string;
}) {
  const url = (destino: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    if (empleador) params.set("empleador", empleador);
    if (destino > 1) params.set("page", String(destino));
    const cadena = params.toString();
    return cadena ? `/personas?${cadena}` : "/personas";
  };

  return (
    <nav
      aria-label="Páginas de resultados"
      className="flex flex-wrap items-center justify-between gap-4 rounded-lg bg-surface p-5 shadow-1"
    >
      <p className="text-[17px] text-ink-2">
        Página {page} de {totalPages}
      </p>
      <div className="flex gap-3">
        <PasoPagina href={url(page - 1)} disponible={page > 1} etiqueta="Página anterior" direccion="atras" />
        <PasoPagina
          href={url(page + 1)}
          disponible={page < totalPages}
          etiqueta="Página siguiente"
          direccion="adelante"
        />
      </div>
    </nav>
  );
}

function PasoPagina({
  href,
  disponible,
  etiqueta,
  direccion,
}: {
  href: string;
  disponible: boolean;
  etiqueta: string;
  direccion: "atras" | "adelante";
}) {
  const flecha = (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
      <path d={direccion === "atras" ? "M14 6l-6 6 6 6" : "M10 6l6 6-6 6"} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  const contenido =
    direccion === "atras" ? (
      <>
        {flecha}
        {etiqueta}
      </>
    ) : (
      <>
        {etiqueta}
        {flecha}
      </>
    );

  const base =
    "inline-flex h-12 items-center gap-2.5 rounded-md border px-5 text-[17px] font-semibold";

  if (!disponible) {
    // Se deja visible y apagado: desaparecer el control haría dudar de si
    // existe o de si la pantalla se rompió.
    return (
      <span aria-disabled="true" className={`${base} border-line bg-paper-deep text-ink-3 opacity-60`}>
        {contenido}
      </span>
    );
  }

  return (
    <Link
      href={href}
      className={`${base} border-line-strong bg-surface text-ink shadow-1 hover:bg-surface-hover focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-action`}
    >
      {contenido}
    </Link>
  );
}
