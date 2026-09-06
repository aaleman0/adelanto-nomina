"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/ui/button";
import { BlockTitle, Card } from "@/ui/surface";
import { ConfirmDialog } from "@/ui/overlay";
import { useToast } from "@/ui/toast";
import {
  regenerateContractLinkAction,
  requestContractAction,
  resendSignedContractAction,
  retryContractFlowAction,
} from "../actions";
import { fecha } from "./vocabulario";

/** Cuál de las acciones es la que toca AHORA según en qué punto va el trabajo. */
export type AccionPrincipal = "solicitar" | "regenerar" | "reintentar" | "entregar" | "ninguna";

type Props = {
  employeeId: string;
  contractRequestId: string | null;
  rfc: string | null;
  telefono: string | null;
  firmado: boolean;
  haySolicitud: boolean;
  puedeOperar: boolean;
  principal: AccionPrincipal;
  signingUrl: string | null;
  enlaceVigente: boolean;
  linkExpiraEn: string | null;
};

const MOTIVO_ROL = "Requiere rol operaciones. Pídeselo a un administrador.";

/**
 * Acciones del expediente.
 *
 * Dos reglas gobiernan este bloque:
 * · Nada se oculta. Un control que no aplica se ve apagado y dice POR QUÉ; un
 *   botón que desaparece hace dudar de si la función existe.
 * · Las cuatro acciones o gastan una firma de EasyLex o mandan un WhatsApp a
 *   una persona real, así que las cuatro confirman antes, con la consecuencia
 *   escrita sin rodeos.
 */
export function AccionesExpediente({
  employeeId,
  contractRequestId,
  rfc,
  telefono,
  firmado,
  haySolicitud,
  puedeOperar,
  principal,
  signingUrl,
  enlaceVigente,
  linkExpiraEn,
}: Props) {
  const sinRol = puedeOperar ? null : MOTIVO_ROL;

  const motivoSolicitar =
    sinRol ??
    (firmado ? "Ya está firmado: no hace falta volver a pedirlo." : null) ??
    (rfc ? null : "Falta el RFC de esta persona. Corrígelo en el archivo de nómina y vuelve a cargarlo.");

  const motivoSobreSolicitud =
    sinRol ??
    (!haySolicitud ? "Todavía no hay solicitud de contrato. Empieza por «Solicitar el contrato»." : null) ??
    (firmado ? "Ya está firmado: no hay nada que rehacer." : null);

  const motivoReenviar =
    sinRol ??
    (!firmado ? "Solo se puede reenviar cuando el contrato ya está firmado." : null) ??
    (!haySolicitud ? "No hay solicitud de contrato de la cual sacar el archivo." : null);

  return (
    <Card>
      <BlockTitle
        title="Acciones"
        hint="Cada botón dice qué va a pasar antes de ejecutarlo. Lo que no aplica se queda apagado con el motivo."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <form action={requestContractAction}>
          <input type="hidden" name="employee_id" value={employeeId} />
          <input type="hidden" name="rfc" value={rfc ?? ""} />
          <input type="hidden" name="telefono_normalizado" value={telefono ?? ""} />
          <Accion
            etiqueta="Solicitar el contrato"
            explicacion="Genera el contrato y le manda por WhatsApp el enlace para firmar."
            titulo="Solicitar el contrato de esta persona"
            consecuencia="Se genera el contrato en EasyLex y se le envía el enlace de firma por WhatsApp. Si ya hay un enlace vigente se reutiliza y no se gasta otra firma."
            confirmLabel="Sí, solicitar el contrato"
            destacada={principal === "solicitar"}
            motivo={motivoSolicitar}
          />
        </form>

        <form action={regenerateContractLinkAction}>
          <input type="hidden" name="contract_request_id" value={contractRequestId ?? ""} />
          <input type="hidden" name="employee_id" value={employeeId} />
          <Accion
            etiqueta="Regenerar el enlace de firma"
            explicacion="Para cuando el enlace anterior se venció y la persona ya no puede firmar."
            titulo="Regenerar el enlace de firma"
            consecuencia="Se crea un enlace de firma nuevo en EasyLex, lo que gasta una firma. Si el enlace anterior sigue vigente, el sistema lo reutiliza y no gasta ninguna."
            confirmLabel="Sí, regenerar el enlace"
            destacada={principal === "regenerar"}
            motivo={motivoSobreSolicitud}
          />
        </form>

        <form action={retryContractFlowAction}>
          <input type="hidden" name="contract_request_id" value={contractRequestId ?? ""} />
          <input type="hidden" name="employee_id" value={employeeId} />
          <Accion
            etiqueta="Reintentar el contrato"
            explicacion="Para cuando el contrato quedó marcado como fallido y hay que volver a empujarlo."
            titulo="Reintentar el contrato"
            consecuencia="Se vuelve a correr el flujo del contrato y, si hace falta, se crea un intento nuevo en EasyLex (eso gasta una firma). Queda registrado en la línea de tiempo."
            confirmLabel="Sí, reintentar"
            destacada={principal === "reintentar"}
            motivo={motivoSobreSolicitud}
          />
        </form>

        <form action={resendSignedContractAction}>
          <input type="hidden" name="contract_request_id" value={contractRequestId ?? ""} />
          <input type="hidden" name="employee_id" value={employeeId} />
          <Accion
            etiqueta="Reenviar el contrato firmado"
            explicacion="Para cuando la entrega automática no llegó y la persona se quedó sin su copia."
            titulo="Reenviar el contrato firmado"
            consecuencia="Se vuelve a archivar el PDF firmado y se le manda por WhatsApp. No genera un contrato nuevo ni gasta firmas."
            confirmLabel="Sí, reenviar por WhatsApp"
            destacada={principal === "entregar"}
            motivo={motivoReenviar}
          />
        </form>
      </div>

      <div className="mt-7 flex flex-wrap items-start gap-x-8 gap-y-6 border-t border-line pt-6">
        <DescargaPdf
          contractRequestId={contractRequestId}
          firmado={firmado}
          puedeOperar={puedeOperar}
        />
        <EnlaceDeFirma
          signingUrl={signingUrl}
          enlaceVigente={enlaceVigente}
          linkExpiraEn={linkExpiraEn}
        />
      </div>
    </Card>
  );
}

/**
 * Un control accionable dentro de su propio `<form>`. El botón no envía por sí
 * mismo: abre la confirmación, y solo al aceptar se envía el formulario que lo
 * contiene. `useFormStatus` lee el envío de ESE formulario, así que cada acción
 * muestra su propio progreso sin bloquear a las demás.
 */
function Accion({
  etiqueta,
  explicacion,
  titulo,
  consecuencia,
  confirmLabel,
  destacada,
  motivo,
}: {
  etiqueta: string;
  explicacion: string;
  titulo: string;
  consecuencia: string;
  confirmLabel: string;
  destacada: boolean;
  motivo: string | null;
}) {
  const [abierto, setAbierto] = useState(false);
  const ancla = useRef<HTMLDivElement>(null);
  const { pending } = useFormStatus();
  const bloqueada = Boolean(motivo);

  return (
    <div ref={ancla} className="flex flex-col gap-2">
      <Button
        variant={destacada ? "primary" : "secondary"}
        size={destacada ? "lg" : "md"}
        full
        disabled={bloqueada}
        loading={pending}
        loadingLabel="Trabajando…"
        onClick={() => setAbierto(true)}
      >
        {etiqueta}
      </Button>
      <p className={`text-[15px] leading-snug ${bloqueada ? "text-attention" : "text-ink-3"}`}>
        {motivo ?? explicacion}
      </p>

      <ConfirmDialog
        open={abierto}
        onClose={() => setAbierto(false)}
        onConfirm={() => {
          setAbierto(false);
          // El formulario es el ancestro de este bloque; `requestSubmit`
          // dispara la server action y activa `useFormStatus`.
          ancla.current?.closest("form")?.requestSubmit();
        }}
        title={titulo}
        consequence={consecuencia}
        confirmLabel={confirmLabel}
        tone="primary"
      />
    </div>
  );
}

/**
 * Descarga del PDF archivado. Es un `<a>` a un endpoint que redirige a una URL
 * firmada de 60 segundos: no puede ser un `fetch`, tiene que navegar.
 */
function DescargaPdf({
  contractRequestId,
  firmado,
  puedeOperar,
}: {
  contractRequestId: string | null;
  firmado: boolean;
  puedeOperar: boolean;
}) {
  const motivo = !puedeOperar
    ? MOTIVO_ROL
    : !firmado
      ? "El PDF existe cuando la persona ya firmó."
      : !contractRequestId
        ? "No hay solicitud de contrato de la cual sacar el archivo."
        : null;

  return (
    <div className="flex min-w-[16rem] flex-1 flex-col gap-2">
      {motivo ? (
        <span
          aria-disabled="true"
          className="inline-flex h-12 items-center justify-center gap-2.5 rounded-md border border-line bg-paper-deep px-5 text-[17px] font-semibold text-ink-3 opacity-60"
        >
          <IconoDescarga />
          Descargar el contrato firmado
        </span>
      ) : (
        <a
          href={`/api/backoffice/contracts/${contractRequestId}/signed-pdf`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-12 items-center justify-center gap-2.5 rounded-md border border-line-strong bg-surface px-5 text-[17px] font-semibold text-ink shadow-1 hover:bg-surface-hover focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-action"
        >
          <IconoDescarga />
          Descargar el contrato firmado
        </a>
      )}
      <p className={`text-[15px] leading-snug ${motivo ? "text-attention" : "text-ink-3"}`}>
        {motivo ?? "Abre la copia archivada del PDF que firmó la persona."}
      </p>
    </div>
  );
}

/** El enlace de EasyLex, para mandárselo a mano cuando el WhatsApp no llegó. */
function EnlaceDeFirma({
  signingUrl,
  enlaceVigente,
  linkExpiraEn,
}: {
  signingUrl: string | null;
  enlaceVigente: boolean;
  linkExpiraEn: string | null;
}) {
  const toast = useToast();

  if (!signingUrl) return null;

  return (
    <div className="flex min-w-[16rem] flex-1 flex-col gap-2">
      <div className="flex flex-wrap gap-3">
        {enlaceVigente ? (
          <a
            href={signingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-12 items-center justify-center gap-2.5 rounded-md border border-line-strong bg-surface px-5 text-[17px] font-semibold text-ink shadow-1 hover:bg-surface-hover focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-action"
          >
            <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M14 4h6v6M20 4l-9 9" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" strokeLinecap="round" />
            </svg>
            Abrir el enlace de firma
          </a>
        ) : null}
        <Button
          variant="quiet"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(signingUrl);
              toast.done("Enlace copiado. Ya puedes pegárselo a la persona.");
            } catch {
              toast.failed("Tu navegador no dejó copiar. Selecciona el enlace y cópialo a mano.");
            }
          }}
          icon={
            <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <rect x="9" y="9" width="11" height="11" rx="2" />
              <path d="M5 15V5a1 1 0 011-1h9" strokeLinecap="round" />
            </svg>
          }
        >
          Copiar el enlace de firma
        </Button>
      </div>
      <p className="text-[15px] leading-snug text-ink-3">
        {enlaceVigente
          ? `El enlace sirve hasta el ${fecha(linkExpiraEn)}.`
          : `El enlace se venció el ${fecha(linkExpiraEn)}; para que sirva hay que regenerarlo.`}
      </p>
    </div>
  );
}

function IconoDescarga() {
  return (
    <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M12 4v10m0 0l-4-4m4 4l4-4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 17v2a1 1 0 001 1h14a1 1 0 001-1v-2" strokeLinecap="round" />
    </svg>
  );
}
