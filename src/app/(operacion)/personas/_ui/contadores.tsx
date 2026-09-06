"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { CountTile } from "@/ui/status";
import { Grid } from "@/ui/screen";
import type {
  ContractControlMetric,
  ContractOperationalStatus,
} from "@/lib/backoffice/contract-control";
import { CONTADOR } from "./vocabulario";

/**
 * Contadores globales por estado. Son conteos de TRABAJO —cuánto falta de cada
 * cosa en todo el sistema—, nunca de lo que hizo una persona: no dependen de
 * quién esté con la sesión abierta ni cambian al filtrar.
 *
 * Cada azulejo es un filtro: pulsarlo acota la lista a ese estado y volver a
 * pulsarlo lo quita, para no obligar a bajar hasta "Quitar filtros".
 */
export function Contadores({
  metrics,
  status,
  q,
  empleador,
}: {
  metrics: ContractControlMetric[];
  status: ContractOperationalStatus | "all";
  q: string;
  empleador: string;
}) {
  const router = useRouter();
  const [, iniciar] = useTransition();

  function filtrarPor(estado: ContractOperationalStatus) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (empleador) params.set("empleador", empleador);
    if (estado !== status) params.set("status", estado);
    const cadena = params.toString();
    iniciar(() => router.push(cadena ? `/personas?${cadena}` : "/personas", { scroll: false }));
  }

  const conNota = metrics.filter((m) => CONTADOR[m.key]?.nota && m.value > 0);

  return (
    <section aria-label="Estado del trabajo">
      <Grid cols="sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => {
          const def = CONTADOR[metric.key];
          if (!def) return null;
          return (
            <CountTile
              key={metric.key}
              count={metric.value}
              label={def.label}
              tone={def.tone}
              active={status === def.filtro}
              onClick={() => filtrarPor(def.filtro)}
            />
          );
        })}
      </Grid>

      {conNota.map((metric) => (
        <p key={metric.key} className="mt-4 text-[15px] leading-snug text-ink-3">
          <span className="font-semibold text-ink-2">{CONTADOR[metric.key].label}:</span>{" "}
          {CONTADOR[metric.key].nota}
        </p>
      ))}
    </section>
  );
}
