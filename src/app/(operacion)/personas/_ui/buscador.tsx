"use client";

import { useCallback, useEffect, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { SearchInput, SelectInput } from "@/ui/field";
import { Button } from "@/ui/button";
import { Card } from "@/ui/surface";
import { describeStatus } from "@/ui/status";
import type { ContractOperationalStatus } from "@/lib/backoffice/contract-control";
import { ESTADOS_EN_ORDEN } from "./vocabulario";

type Props = {
  q: string;
  status: ContractOperationalStatus | "all";
  empleador: string;
  empleadores: string[];
  /** Resultados (renderizados en el servidor) que este panel atenúa mientras busca. */
  children: ReactNode;
};

/**
 * Panel de búsqueda: la tarea de esta pantalla es ENCONTRAR a una persona, así
 * que el campo de texto es el elemento más grande y lo demás (estado,
 * empleador) solo acota.
 *
 * El estado vive en la URL, no en React: así una búsqueda se puede compartir,
 * marcar y recargar. Los resultados llegan como `children` desde el servidor;
 * este componente solo los atenúa mientras la nueva consulta viaja, para que
 * el operador vea que el sistema está trabajando sin que la lista desaparezca.
 */
export function Buscador({ q, status, empleador, empleadores, children }: Props) {
  const router = useRouter();
  const [termino, setTermino] = useState(q);
  const [pendiente, iniciar] = useTransition();

  const construirUrl = useCallback(
    (cambios: { q?: string; status?: string; empleador?: string }) => {
      const siguiente = {
        q: cambios.q ?? q,
        status: cambios.status ?? (status === "all" ? "" : status),
        empleador: cambios.empleador ?? empleador,
      };
      const params = new URLSearchParams();
      if (siguiente.q.trim()) params.set("q", siguiente.q.trim());
      if (siguiente.status) params.set("status", siguiente.status);
      if (siguiente.empleador) params.set("empleador", siguiente.empleador);
      // Cualquier cambio de filtro vuelve a la página 1: quedarse en la 7 de un
      // resultado que ahora tiene 2 páginas deja la pantalla en blanco.
      const cadena = params.toString();
      return cadena ? `/personas?${cadena}` : "/personas";
    },
    [q, status, empleador],
  );

  // El historial del navegador es un sistema externo con su propio estado: al
  // usar atrás/adelante la URL cambia sin pasar por este componente, y el campo
  // quedaría mostrando una búsqueda que ya no es la que se ve en la lista.
  useEffect(() => {
    const alNavegar = () => {
      setTermino(new URLSearchParams(window.location.search).get("q") ?? "");
    };
    window.addEventListener("popstate", alNavegar);
    return () => window.removeEventListener("popstate", alNavegar);
  }, []);

  // Escribir no dispara una consulta por tecla: se espera a que la persona pare.
  useEffect(() => {
    if (termino.trim() === q) return;
    const id = setTimeout(() => {
      iniciar(() => router.replace(construirUrl({ q: termino }), { scroll: false }));
    }, 350);
    return () => clearTimeout(id);
  }, [termino, q, router, construirUrl, iniciar]);

  const hayFiltro = Boolean(q || empleador || status !== "all");

  return (
    <>
      <Card>
        <div className="flex flex-col gap-6">
          <div>
            <p className="text-[23px] font-bold leading-tight text-ink">Buscar a una persona</p>
            <p className="mt-1 text-[15px] text-ink-3">
              Por nombre, RFC o teléfono. Basta con una parte.
            </p>
            <div className="mt-4">
              {/* El atajo "/" lo registra el Shell para toda la aplicación y
                  lleva a Personas con la búsqueda limpia; aquí solo se dibuja
                  la tecla junto al campo al que corresponde. */}
              <SearchInput
                value={termino}
                onChange={setTermino}
                placeholder="Nombre, RFC o teléfono"
                shortcut="/"
                autoFocus={!q}
              />
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <SelectInput
              label="Estado del trabajo"
              value={status}
              onChange={(e) =>
                iniciar(() =>
                  router.push(
                    construirUrl({ status: e.target.value === "all" ? "" : e.target.value }),
                    { scroll: false },
                  ),
                )
              }
            >
              <option value="all">Todos los estados</option>
              {/* El nombre de cada estado lo pone el diccionario del sistema:
                  el filtro tiene que decir lo mismo que la ficha de la lista. */}
              {ESTADOS_EN_ORDEN.map((estado) => (
                <option key={estado} value={estado}>
                  {describeStatus(estado).label}
                </option>
              ))}
            </SelectInput>

            <SelectInput
              label="Empleador"
              value={empleador}
              hint={empleadores.length === 0 ? "Aún no hay empleadores cargados." : undefined}
              disabled={empleadores.length === 0}
              onChange={(e) =>
                iniciar(() => router.push(construirUrl({ empleador: e.target.value }), { scroll: false }))
              }
            >
              <option value="">Todos los empleadores</option>
              {empleadores.map((nombre) => (
                <option key={nombre} value={nombre}>
                  {nombre}
                </option>
              ))}
            </SelectInput>
          </div>

          <div className="flex min-h-12 flex-wrap items-center gap-4">
            {hayFiltro ? (
              <Button
                variant="quiet"
                onClick={() => {
                  setTermino("");
                  iniciar(() => router.push("/personas", { scroll: false }));
                }}
                icon={
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.4">
                    <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
                  </svg>
                }
              >
                Quitar filtros
              </Button>
            ) : null}
            {pendiente ? (
              <span role="status" className="text-[15px] font-semibold text-action">
                Buscando…
              </span>
            ) : null}
          </div>
        </div>
      </Card>

      <div
        aria-busy={pendiente || undefined}
        className={`transition-opacity duration-[160ms] ${pendiente ? "opacity-50" : "opacity-100"}`}
      >
        {children}
      </div>
    </>
  );
}
