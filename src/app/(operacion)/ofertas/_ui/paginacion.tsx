"use client";

import { Button } from "@/ui/button";

/**
 * Paginación.
 *
 * Dice SIEMPRE dónde está uno y cuánto hay en total: un "Siguiente" a solas
 * obliga a adivinar si falta una página o cuarenta. Los botones se deshabilitan
 * en los extremos en lugar de desaparecer, para que la barra no cambie de forma
 * al navegar.
 */
export function Paginacion({
  pagina,
  totalPaginas,
  total,
  unidad,
  onIr,
}: {
  pagina: number;
  totalPaginas: number;
  total: number;
  /** Qué se está contando, en plural: "envíos", "mensajes". */
  unidad: string;
  onIr: (pagina: number) => void;
}) {
  if (total === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-md bg-paper-deep px-5 py-4">
      <p className="text-[15px] text-ink-2">
        Página <strong className="text-ink tabular">{pagina}</strong> de{" "}
        <strong className="text-ink tabular">{Math.max(totalPaginas, 1)}</strong> ·{" "}
        <strong className="text-ink tabular">{total}</strong> {unidad} en total
      </p>
      <div className="flex gap-3">
        <Button
          variant="secondary"
          size="sm"
          disabled={pagina <= 1}
          onClick={() => onIr(pagina - 1)}
        >
          Página anterior
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={pagina >= totalPaginas}
          onClick={() => onIr(pagina + 1)}
        >
          Página siguiente
        </Button>
      </div>
    </div>
  );
}
