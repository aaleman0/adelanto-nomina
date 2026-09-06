"use client";

import { useEffect } from "react";
import { ErrorState } from "@/ui/states";

/**
 * Falla de una pantalla del backoffice.
 *
 * El detalle técnico va a la consola (y a Sentry), nunca a la cara del
 * operador: en pantalla solo qué pasó y qué hacer ahora.
 *
 * Next 16 pasa `unstable_retry`, que además de limpiar el boundary vuelve a
 * pedir los datos al servidor (a diferencia del viejo `reset`).
 */
export default function ErrorPantalla({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[pantalla]", error);
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-3xl px-8 py-16">
      <ErrorState
        title="No se pudo abrir esta pantalla"
        hint="Fue un problema del sistema, no algo que hayas hecho mal. Vuelve a intentarlo; si sigue igual, avisa a soporte."
        onRetry={() => unstable_retry()}
      />
    </div>
  );
}
