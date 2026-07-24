import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getWhatsAppClient } from "@/lib/whatsapp/client";
import { normalizePhoneForMeta } from "@/lib/whatsapp/phone-utils";
import { formatDateForDisplay } from "@/lib/contracts/format-date";
import { logger } from "@/lib/logger";

/**
 * Envío del link de firma al empleado por WhatsApp.
 *
 * Antes, `requestContractFromWhatsApp` generaba el contrato y **devolvía** el
 * link, pero nadie lo enviaba: se asumía que un sistema conversacional externo
 * lo reenviaba. Esta función cierra ese hueco: la app manda el link ella misma.
 *
 * Se entrega como plantilla con botón URL (`sendTemplateWithButton`), que es lo
 * que Meta exige para un mensaje iniciado por el negocio. El cuerpo lleva
 * nombre, monto y fecha límite; el botón lleva el sufijo del link de firma.
 *
 * La plantilla por defecto (`adelanto_contrato_listo`, categoría UTILITY) tiene
 * tres variables de cuerpo — `{{1}}` nombre, `{{2}}` monto, `{{3}}` fecha
 * límite — y un botón URL dinámico cuya base está fija en la plantilla, con un
 * único `{{1}}` de sufijo. Meta solo acepta ese sufijo (p. ej. el signerId), no
 * una URL completa.
 *
 * NO es fatal: si el envío falla (WhatsApp mal configurado, plantilla no
 * aprobada, número inválido), el contrato ya está generado y el link sigue
 * disponible. Se registra el fallo y se devuelve, pero no se lanza: perder el
 * envío no debe tirar toda la solicitud.
 */

/** Plantilla aprobada en Meta, con un botón URL. Configurable por entorno. */
function contractTemplateName(): string {
  return process.env.WHATSAPP_CONTRACT_TEMPLATE || "adelanto_contrato_listo";
}

/**
 * El botón URL de la plantilla es dinámico: base fija + `{{1}}`. Meta solo
 * acepta el sufijo que rellena `{{1}}`, no la URL completa. Se toma el último
 * segmento del path del link de firma (el signerId / id de intento).
 */
function signingUrlSuffix(signingUrl: string): string {
  const path = signingUrl.split("?")[0].split("#")[0];
  const segments = path.split("/").filter(Boolean);
  return segments[segments.length - 1] || signingUrl;
}

export type SendContractLinkInput = {
  employeeId: string;
  offerId: string | null;
  contractRequestId: string;
  nombre: string | null;
  telefonoNormalizado: string | null;
  monto: number | null;
  signingUrl: string | null;
  /** Fecha límite de firma (ISO). Rellena la 3ª variable de la plantilla. */
  expiresAt?: string | null;
  subscriberId?: string | null;
  correlationId: string;
};

export type SendContractLinkResult =
  | { sent: true; messageId: string | undefined }
  | { sent: false; reason: string };

function formatMonto(monto: number | null): string {
  if (monto === null || monto === undefined) return "N/A";
  return new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 }).format(monto);
}

export async function sendContractLinkWhatsApp(
  input: SendContractLinkInput,
): Promise<SendContractLinkResult> {
  // Envoltura que garantiza que esta función NUNCA lanza: es un efecto
  // secundario del flujo de contrato, y un fallo aquí no debe tumbar una
  // solicitud cuyo contrato ya quedó generado.
  try {
    return await attemptSend(input);
  } catch (error) {
    logger.error("contract.link_send.unexpected", error, {
      employeeId: input.employeeId,
      contractRequestId: input.contractRequestId,
      correlationId: input.correlationId,
    });
    return { sent: false, reason: error instanceof Error ? error.message : "Error inesperado." };
  }
}

async function attemptSend(input: SendContractLinkInput): Promise<SendContractLinkResult> {
  if (!input.signingUrl) {
    return await record(input, { sent: false, reason: "Sin link de firma que enviar." });
  }

  const to = normalizePhoneForMeta(input.telefonoNormalizado);
  if (!to) {
    return await record(input, { sent: false, reason: "Empleado sin teléfono normalizado." });
  }

  const client = getWhatsAppClient();
  const variables: Record<string, string> = {
    "1": input.nombre || "Empleado",
    "2": formatMonto(input.monto),
    // La plantilla nunca admite una variable vacía; si no hay fecha límite se
    // usa un texto genérico en su lugar.
    "3": input.expiresAt ? formatDateForDisplay(input.expiresAt) : "el plazo indicado",
  };

  const result = await client.sendTemplateWithButton(
    to,
    contractTemplateName(),
    variables,
    signingUrlSuffix(input.signingUrl),
  );

  if (!result.ok) {
    logger.error("contract.link_send.failed", new Error(result.error), {
      employeeId: input.employeeId,
      contractRequestId: input.contractRequestId,
      correlationId: input.correlationId,
    });
    return await record(input, { sent: false, reason: result.error ?? "Error desconocido al enviar." });
  }

  logger.info("contract.link_send.sent", {
    employeeId: input.employeeId,
    contractRequestId: input.contractRequestId,
    messageId: result.messageId,
    correlationId: input.correlationId,
  });

  return await record(input, { sent: true, messageId: result.messageId });
}

/**
 * Deja constancia del intento de envío en `whatsapp_contract_messages`, con el
 * mismo esquema que el resto de interacciones de contrato. El registro tampoco
 * es fatal: si falla, se loguea pero se devuelve el resultado del envío.
 */
async function record(
  input: SendContractLinkInput,
  outcome: SendContractLinkResult,
): Promise<SendContractLinkResult> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("whatsapp_contract_messages").insert({
    employee_id: input.employeeId,
    offer_id: input.offerId,
    contract_request_id: input.contractRequestId,
    whatsapp_subscriber_id: input.subscriberId ?? null,
    message_type: "contract_link",
    status: outcome.sent ? "sent" : "failed",
    delivery_status: outcome.sent ? "sent" : "failed",
    sent_at: outcome.sent ? new Date().toISOString() : null,
    wa_message_id: outcome.sent ? (outcome.messageId ?? null) : null,
    error_message: outcome.sent ? null : outcome.reason,
    correlation_id: input.correlationId,
    metadata: { template: contractTemplateName() },
  });

  if (error) {
    logger.error("contract.link_send.record_failed", error, {
      contractRequestId: input.contractRequestId,
    });
  }

  return outcome;
}
