"use client";

import { useEffect, useState } from "react";
import { BlockTitle, Card, Sunken } from "@/ui/surface";
import { Status } from "@/ui/status";
import { AsyncSwitch, LoadingRows } from "@/ui/states";
import { Button } from "@/ui/button";
import { fecha, tipoDeMensaje } from "./vocabulario";

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

/**
 * Evidencia de lo que se le mandó por WhatsApp a esta persona.
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
        hint="Lo que el sistema le ha mandado a esta persona y si le llegó. Los 50 más recientes."
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
  const [mensajes, setMensajes] = useState<Mensaje[] | null>(null);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    let vivo = true;

    fetch(`/api/whatsapp/messages/employee?employeeId=${encodeURIComponent(employeeId)}`, {
      cache: "no-store",
    })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.ok) throw new Error("respuesta no válida");
        return (data.messages ?? []) as Mensaje[];
      })
      .then((lista) => {
        if (vivo) setMensajes(lista);
      })
      .catch(() => {
        if (vivo) setFallo(true);
      });

    return () => {
      vivo = false;
    };
  }, [employeeId]);

  const estado = fallo
    ? "error"
    : mensajes === null
      ? "loading"
      : mensajes.length === 0
        ? "empty"
        : "ready";

  return (
    <AsyncSwitch
      state={estado}
      loading={<LoadingRows rows={2} />}
      empty={
        <Sunken>
          <p className="text-[17px] text-ink-2">
            Todavía no se le ha mandado ningún mensaje. Los envíos se hacen desde Ofertas.
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
      <ul className="flex flex-col gap-3">
        {(mensajes ?? []).map((m) => (
          <li key={m.id}>
            <Sunken>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[17px] font-semibold text-ink">{tipoDeMensaje(m.message_type)}</p>
                  <p className="mt-0.5 text-[15px] text-ink-3">Enviado el {fecha(m.created_at)}</p>
                  {m.clicked_at ? (
                    <p className="mt-1 text-[15px] font-semibold text-done">
                      Abrió el enlace el {fecha(m.clicked_at)}
                    </p>
                  ) : null}
                  {m.error_message ? (
                    <p className="mt-1 text-[15px] text-failed">{m.error_message}</p>
                  ) : null}
                  {m.retry_count && m.retry_count > 0 ? (
                    <p className="mt-1 text-[15px] text-ink-3">
                      Se reintentó {m.retry_count} {m.retry_count === 1 ? "vez" : "veces"}.
                    </p>
                  ) : null}
                </div>
                <Status value={m.delivery_status ?? m.status} size="sm" />
              </div>
            </Sunken>
          </li>
        ))}
      </ul>
    </AsyncSwitch>
  );
}
