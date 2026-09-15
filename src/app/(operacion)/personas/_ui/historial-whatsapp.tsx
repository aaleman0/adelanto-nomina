"use client";

import { useEffect, useState } from "react";
import { BlockTitle, Card, Sunken } from "@/ui/surface";
import { Status } from "@/ui/status";
import { AsyncSwitch, LoadingRows } from "@/ui/states";
import { Button } from "@/ui/button";
import type { RespuestaDePersona } from "@/lib/whatsapp/respuestas";
import {
  comoLoTomoElSistema,
  fecha,
  queMandoLaPersona,
  tipoDeMensaje,
  type TonoDeRespuesta,
} from "./vocabulario";

type Mensaje = {
  id: string;
  message_type: string | null;
  status: string | null;
  delivery_status: string | null;
  clicked_at: string | null;
  created_at: string;
  delivered_at: string | null;
  read_at: string | null;
  error_message: string | null;
  retry_count: number | null;
};

type Historial = {
  mensajes: Mensaje[];
  /** `null` = no se pudieron leer, que no es lo mismo que "no contestó nada". */
  respuestas: RespuestaDePersona[] | null;
};

type Renglon =
  | { tipo: "salida"; cuando: number; mensaje: Mensaje }
  | { tipo: "entrada"; cuando: number; respuesta: RespuestaDePersona };

/** Lo enviado y lo contestado en una sola lista, lo más reciente arriba: se lee como la conversación. */
function enOrden(historial: Historial): Renglon[] {
  const renglones: Renglon[] = [
    ...historial.mensajes.map((mensaje) => ({
      tipo: "salida" as const,
      cuando: new Date(mensaje.created_at).getTime() || 0,
      mensaje,
    })),
    ...(historial.respuestas ?? []).map((respuesta) => ({
      tipo: "entrada" as const,
      cuando: new Date(respuesta.recibidaEn).getTime() || 0,
      respuesta,
    })),
  ];
  return renglones.sort((a, b) => b.cuando - a.cuando);
}

const COLOR_DE_TONO: Record<TonoDeRespuesta, string> = {
  done: "text-done",
  attention: "text-attention",
  failed: "text-failed",
  neutral: "text-ink-2",
};

/**
 * Evidencia de lo que se le mandó por WhatsApp a esta persona y de lo que
 * contestó.
 *
 * Se pide desde el cliente y no en el servidor a propósito: es un panel de
 * consulta secundario y no debe retrasar la aparición del expediente, que es
 * lo que el operador vino a ver. Si falla, el resto de la pantalla sigue en pie.
 */
export function HistorialWhatsApp({ employeeId }: { employeeId: string }) {
  // Reintentar = volver a montar la lista. Así arranca de cero en "cargando"
  // sin tener que reponer el estado a mano dentro del efecto.
  const [intento, setIntento] = useState(0);

  return (
    <Card>
      <BlockTitle
        title="Mensajes de WhatsApp"
        hint="Lo que se le mandó, si le llegó, y lo que contestó. Lo más reciente arriba."
      />
      <ListaDeMensajes
        key={intento}
        employeeId={employeeId}
        onReintentar={() => setIntento((n) => n + 1)}
      />
    </Card>
  );
}

function ListaDeMensajes({
  employeeId,
  onReintentar,
}: {
  employeeId: string;
  onReintentar: () => void;
}) {
  const [historial, setHistorial] = useState<Historial | null>(null);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    let vivo = true;

    fetch(`/api/whatsapp/messages/employee?employeeId=${encodeURIComponent(employeeId)}`, {
      cache: "no-store",
    })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.ok) throw new Error("respuesta no válida");
        return {
          mensajes: (data.messages ?? []) as Mensaje[],
          respuestas: Array.isArray(data.respuestas) ? (data.respuestas as RespuestaDePersona[]) : null,
        };
      })
      .then((leido) => {
        if (vivo) setHistorial(leido);
      })
      .catch(() => {
        if (vivo) setFallo(true);
      });

    return () => {
      vivo = false;
    };
  }, [employeeId]);

  const renglones = historial ? enOrden(historial) : [];
  const estado = fallo
    ? "error"
    : historial === null
      ? "loading"
      : renglones.length === 0 && historial.respuestas !== null
        ? "empty"
        : "ready";

  return (
    <AsyncSwitch
      state={estado}
      loading={<LoadingRows rows={2} />}
      empty={
        <Sunken>
          <p className="text-[17px] text-ink-2">
            Todavía no se le ha mandado ningún mensaje ni ha contestado nada. Los envíos se hacen
            desde Ofertas.
          </p>
        </Sunken>
      }
      error={
        <Sunken>
          <p className="text-[17px] text-ink-2">
            No se pudo leer el historial de mensajes. El resto del expediente sí está al día.
          </p>
          <div className="mt-4">
            <Button variant="secondary" onClick={onReintentar}>
              Volver a cargar los mensajes
            </Button>
          </div>
        </Sunken>
      }
    >
      <div className="flex flex-col gap-3">
        {historial?.respuestas === null ? (
          <Sunken>
            <p className="text-[17px] text-ink-2">
              No se pudo leer lo que contestó. Lo que se le mandó sí está al día.
            </p>
            <div className="mt-4">
              <Button variant="secondary" onClick={onReintentar}>
                Volver a cargar los mensajes
              </Button>
            </div>
          </Sunken>
        ) : null}
        <ul className="flex flex-col gap-3">
          {renglones.map((renglon) =>
            renglon.tipo === "salida" ? (
              <li key={`salida-${renglon.mensaje.id}`}>
                <MensajeEnviado mensaje={renglon.mensaje} />
              </li>
            ) : (
              <li key={`entrada-${renglon.respuesta.id}`}>
                <RespuestaRecibida respuesta={renglon.respuesta} />
              </li>
            ),
          )}
        </ul>
      </div>
    </AsyncSwitch>
  );
}

function MensajeEnviado({ mensaje: m }: { mensaje: Mensaje }) {
  return (
    <Sunken>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-ink-3">Se le mandó</p>
          <p className="mt-1 text-[17px] font-semibold text-ink">{tipoDeMensaje(m.message_type)}</p>
          <p className="mt-0.5 text-[15px] text-ink-3">Enviado el {fecha(m.created_at)}</p>
          {m.clicked_at ? (
            <p className="mt-1 text-[15px] font-semibold text-done">
              Abrió el enlace el {fecha(m.clicked_at)}
            </p>
          ) : null}
          {m.error_message ? <p className="mt-1 text-[15px] text-failed">{m.error_message}</p> : null}
          {m.retry_count && m.retry_count > 0 ? (
            <p className="mt-1 text-[15px] text-ink-3">
              Se reintentó {m.retry_count} {m.retry_count === 1 ? "vez" : "veces"}.
            </p>
          ) : null}
        </div>
        <Status value={m.delivery_status ?? m.status} size="sm" />
      </div>
    </Sunken>
  );
}

function RespuestaRecibida({ respuesta }: { respuesta: RespuestaDePersona }) {
  const lectura = comoLoTomoElSistema(respuesta.interpretacion);

  return (
    <Sunken>
      <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-ink-3">Contestó</p>
      <p className="mt-1 text-[17px] font-semibold text-ink">{queMandoLaPersona(respuesta.tipo)}</p>
      <p className="mt-0.5 text-[15px] text-ink-3">Recibido el {fecha(respuesta.recibidaEn)}</p>
      {respuesta.texto ? (
        <p className="mt-3 whitespace-pre-line break-words rounded-md bg-surface px-4 py-3 text-[17px] leading-relaxed text-ink">
          {respuesta.texto}
        </p>
      ) : null}
      {lectura ? (
        <p className={`mt-3 text-[15px] font-semibold ${COLOR_DE_TONO[lectura.tono]}`}>{lectura.texto}</p>
      ) : null}
    </Sunken>
  );
}
