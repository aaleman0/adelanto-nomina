"use client";

import { useState } from "react";
import { BlockTitle, Card, Sunken } from "@/ui/surface";
import { Status } from "@/ui/status";
import { Button } from "@/ui/button";
import { fecha, origenDelEvento } from "./vocabulario";

/**
 * Forma EXACTA de lo que se pinta de cada evento.
 *
 * El tipo es corto a propósito: la fila que llega de la vista de auditoría
 * incluye `metadata`, y ahí dentro viajan `actor_email`, `actor_role` y
 * `actor_id`. Este componente no puede pintarlos porque ni siquiera los
 * recibe: la interfaz muestra el estado del TRABAJO, nunca quién lo hizo.
 */
export type EventoDelExpediente = {
  occurred_at: string;
  source: string;
  /**
   * No se pinta: solo distingue dos movimientos de la misma marca de tiempo al
   * armar la clave de React. Su valor es jerga de la base
   * ("contract_attempt_expirado") y el resumen ya dice el hecho en español.
   */
  event_type: string;
  status: string | null;
  summary: string;
};

const VISIBLES_AL_INICIO = 12;

export function LineaDeTiempo({ eventos }: { eventos: EventoDelExpediente[] }) {
  const [todo, setTodo] = useState(false);
  const visibles = todo ? eventos : eventos.slice(0, VISIBLES_AL_INICIO);
  const ocultos = eventos.length - visibles.length;

  return (
    <Card>
      <BlockTitle
        title="Línea de tiempo"
        hint="Todo lo que le ha pasado a este expediente, de lo más reciente a lo más antiguo."
      />

      {eventos.length === 0 ? (
        <Sunken>
          <p className="text-[17px] text-ink-2">
            Todavía no hay movimientos registrados. Aparecerán en cuanto se le mande la oferta o se
            pida su contrato.
          </p>
        </Sunken>
      ) : (
        <>
          <ol className="ml-1.5 border-l-2 border-line pl-7">
            {visibles.map((evento, i) => (
              <li
                key={`${evento.occurred_at}-${evento.event_type}-${i}`}
                className="relative pb-7 last:pb-0"
              >
                <span
                  aria-hidden="true"
                  className="absolute left-[calc(-1.75rem-6px)] top-2 h-2.5 w-2.5 rounded-full bg-line-strong ring-4 ring-surface"
                />
                <p className="text-[15px] text-ink-3">{fecha(evento.occurred_at)}</p>
                {/* El resumen viene ya redactado en español desde la vista de
                    SQL: es la versión oficial del hecho y no se reescribe. */}
                <p className="mt-1 text-[17px] leading-relaxed text-ink">{evento.summary}</p>
                <div className="mt-2.5 flex flex-wrap items-center gap-3">
                  {evento.status ? <Status value={evento.status} size="sm" /> : null}
                  {/* Qué parte del sistema movió el expediente, en palabras. El
                      `event_type` crudo ya no se pinta: era la misma frase que
                      el resumen, pero en clave de base de datos. */}
                  <span className="text-[15px] text-ink-3">{origenDelEvento(evento.source)}</span>
                </div>
              </li>
            ))}
          </ol>

          {ocultos > 0 ? (
            <div className="mt-2">
              <Button variant="quiet" onClick={() => setTodo(true)}>
                Ver los {ocultos} movimientos anteriores
              </Button>
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}
