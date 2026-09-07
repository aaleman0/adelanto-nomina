"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ErrorState } from "@/ui/states";

/**
 * Error de un bloque que se lee en el servidor. El reintento no recarga la
 * pantalla entera: vuelve a pedir los datos al servidor y conserva lo que el
 * operador ya tenía escrito en los filtros.
 */
export function ErrorRecargable({
  title,
  hint,
}: {
  title?: string;
  hint?: string;
}) {
  const router = useRouter();
  const [, iniciar] = useTransition();

  return (
    <ErrorState
      title={title}
      hint={hint}
      retryLabel="Volver a intentar"
      onRetry={() => iniciar(() => router.refresh())}
    />
  );
}
