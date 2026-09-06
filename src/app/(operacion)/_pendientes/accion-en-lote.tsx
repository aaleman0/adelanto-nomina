"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { Button } from "@/ui/button";
import { ConfirmDialog } from "@/ui/overlay";
import { useToast } from "@/ui/toast";
import { useDialogoDeAtajos } from "./atajos";

/**
 * Acción en lote de un grupo de pendientes.
 *
 * Es acción SECUNDARIA a propósito: cuesta dinero (cada expediente vuelve a
 * pedirle un contrato a EasyLex) y no se puede deshacer, así que el camino
 * grande sigue siendo abrir el expediente uno por uno. Por eso lleva
 * confirmación con la consecuencia escrita, en vez del "hazlo y ofrece
 * deshacer" que usamos para lo reversible.
 */

/**
 * El servidor procesa como máximo esta cantidad por llamada
 * (`MAX_BATCH_ACTIONS` en src/lib/contracts/backoffice-actions.ts) y devuelve
 * cuántos faltan. Se escribe en la confirmación para que nadie crea que una
 * sola pulsada limpia una cola de cientos.
 */
const MAXIMO_POR_TANDA = 25;

type EstadoEnLote = "error" | "link_expirado";

const TEXTOS: Record<
  EstadoEnLote,
  { boton: string; titulo: string; consecuencia: string; confirmar: string }
> = {
  error: {
    boton: "Reintentar los que fallaron",
    titulo: "¿Reintentar los contratos que fallaron?",
    consecuencia:
      `Se vuelve a pedir el contrato de hasta ${MAXIMO_POR_TANDA} expedientes de esta lista. ` +
      "Cada uno genera un enlace de firma nuevo y queda registrado. No se puede deshacer, " +
      "y si hay más de esa cantidad tendrás que repetirlo.",
    confirmar: "Sí, reintentar la tanda",
  },
  link_expirado: {
    boton: "Regenerar los enlaces vencidos",
    titulo: "¿Regenerar los enlaces vencidos?",
    consecuencia:
      `Se genera un enlace de firma nuevo para hasta ${MAXIMO_POR_TANDA} expedientes de esta lista. ` +
      "Los enlaces anteriores dejan de servir y a esas personas hay que volver a avisarles. " +
      "No se puede deshacer, y si hay más de esa cantidad tendrás que repetirlo.",
    confirmar: "Sí, regenerar la tanda",
  },
};

type ResumenLote = {
  processed: number;
  succeeded: number;
  skipped: number;
  failed: number;
  remaining: number;
};

export function AccionEnLote({
  estado,
  habilitado,
  puedeOperar,
}: {
  estado: EstadoEnLote;
  /** Hay algo que procesar en este estado. */
  habilitado: boolean;
  /** Rol `operaciones` o superior. */
  puedeOperar: boolean;
}) {
  const textos = TEXTOS[estado];
  const router = useRouter();
  const toast = useToast();
  const [abierto, setAbierto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  // El refresco del servidor también es espera: el botón sigue ocupado hasta
  // que la lista de abajo ya refleja lo que acaba de pasar.
  const [refrescando, iniciarRefresco] = useTransition();

  // Abrir el diálogo apaga los atajos de la pantalla (y cerrarlo los enciende):
  // sin esto, pulsar "o" sobre la confirmación navegaba a Ofertas y la dejaba
  // sin contestar. Todo abrir/cerrar pasa por aquí para que no se desincronice.
  const marcarDialogo = useDialogoDeAtajos();
  const cambiarDialogo = useCallback(
    (valor: boolean) => {
      setAbierto(valor);
      marcarDialogo(valor);
    },
    [marcarDialogo],
  );

  async function ejecutar() {
    setEnviando(true);
    try {
      const respuesta = await fetch("/api/backoffice/contracts/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: estado }),
      });

      if (respuesta.status === 403) {
        toast.failed("Tu rol no permite esta acción; pídesela a un administrador.");
        return;
      }
      if (respuesta.status === 429) {
        toast.failed("El sistema está frenando esta acción por seguridad. Espera un minuto e inténtalo otra vez.");
        return;
      }
      if (!respuesta.ok) {
        toast.failed("No se pudo procesar la tanda. Vuelve a intentarlo; si sigue igual, avisa a soporte.");
        return;
      }

      const resumen = (await respuesta.json()) as ResumenLote;
      const mensaje = resumir(resumen);
      // Que la respuesta sea 2xx no quiere decir que la tanda saliera bien: el
      // servidor contesta 200 con succeeded=0 y failed=25. La palomita verde
      // solo se pinta cuando de verdad se resolvió algo; si no se resolvió
      // nada, el aviso tiene que verse como lo que es.
      if (resumen.processed === 0) toast.info(mensaje);
      else if (resumen.succeeded === 0) toast.failed(mensaje);
      else toast.done(mensaje);

      cambiarDialogo(false);
      iniciarRefresco(() => router.refresh());
    } catch {
      // Aquí casi siempre es la red del local, no el sistema: se dice así.
      toast.failed("No se pudo conectar. Revisa el internet y vuelve a intentarlo.");
    } finally {
      setEnviando(false);
    }
  }

  const ocupado = enviando || refrescando;

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button
        variant="secondary"
        size="md"
        onClick={() => cambiarDialogo(true)}
        disabled={!puedeOperar || !habilitado}
        loading={ocupado}
        loadingLabel="Procesando la tanda…"
      >
        {textos.boton}
      </Button>
      {!puedeOperar ? (
        <span className="text-[13px] font-semibold text-ink-3">Requiere rol operaciones</span>
      ) : null}

      <ConfirmDialog
        open={abierto}
        onClose={() => cambiarDialogo(false)}
        onConfirm={() => void ejecutar()}
        title={textos.titulo}
        consequence={textos.consecuencia}
        confirmLabel={textos.confirmar}
        loading={enviando}
        tone="primary"
      />
    </div>
  );
}

/**
 * Elige la variante que concuerda con el número.
 *
 * El resumen de UN expediente es el más frecuente (el último que queda en la
 * cola), y "1 volvieron a fallar" hace dudar de la cifra y del resto del aviso.
 */
function concordar(n: number, singular: string, plural: string): string {
  return n === 1 ? singular : plural;
}

/** Traduce el resumen del servidor a una frase de operador: qué pasó y qué sigue. */
function resumir({ processed, succeeded, skipped, failed, remaining }: ResumenLote): string {
  if (processed === 0) return "No quedaba ninguno por procesar en este grupo.";

  const partes = [
    succeeded === 0
      ? "No se resolvió ninguno."
      : concordar(
          succeeded,
          `Se resolvió ${succeeded} de ${processed}.`,
          `Se resolvieron ${succeeded} de ${processed}.`,
        ),
  ];

  // `skipped` NO es "ya estaban resueltos". El servidor lo incrementa cuando la
  // acción devuelve ok:false, y el único caso con ok:false es "not_found"
  // (src/lib/contracts/backoffice-actions.ts): el expediente o su solicitud de
  // contrato no aparecieron. Es trabajo pendiente de investigar, no trabajo
  // hecho; llamarlo "resuelto" escondía expedientes rotos.
  if (skipped > 0) {
    partes.push(
      concordar(
        skipped,
        `${skipped} ya no existe o no se encontró su solicitud: revísalo.`,
        `${skipped} ya no existen o no se encontró su solicitud: revísalos uno por uno.`,
      ),
    );
  }

  if (failed > 0) {
    partes.push(
      concordar(
        failed,
        `${failed} volvió a fallar: ábrelo para ver qué contestó el sistema.`,
        `${failed} volvieron a fallar: ábrelos uno por uno.`,
      ),
    );
  }

  // "Vuelve a pulsar" solo tiene sentido si la tanda avanzó. El servidor toma
  // siempre los primeros del mismo estado, así que con 0 resueltos la
  // siguiente pulsada reintentaría exactamente los mismos (y cada intento
  // cuesta): ahí lo que toca es abrirlos, no insistir.
  if (remaining > 0 && succeeded > 0) {
    partes.push(
      concordar(
        remaining,
        `Falta ${remaining}: vuelve a pulsar para la siguiente tanda.`,
        `Faltan ${remaining}: vuelve a pulsar para la siguiente tanda.`,
      ),
    );
  }

  return partes.join(" ");
}
