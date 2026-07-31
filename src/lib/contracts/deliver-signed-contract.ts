import { getSupabaseAdmin } from "@/lib/supabase/server";
import { EasyLexClient } from "@/lib/easylex/client";
import { getWhatsAppClient } from "@/lib/whatsapp/client";
import { normalizePhoneForMeta } from "@/lib/whatsapp/phone-utils";
import { recordAuditEvent } from "@/lib/audit";
import { logger } from "@/lib/logger";

/**
 * Entrega del contrato FIRMADO al empleado, tras confirmar la firma.
 *
 * Tres pasos:
 *   1. Descargar el PDF firmado de EasyLex.
 *   2. Archivarlo en el bucket privado `contratos-firmados` (respaldo del lado
 *      nuestro) y guardar la ruta en `contract_attempts.signed_pdf_path`.
 *   3. Mandárselo al empleado por WhatsApp como documento.
 *
 * **Nunca lanza.** Es un efecto secundario del webhook de firma: un fallo aquí
 * no debe hacer que el webhook responda 5xx (la firma ya quedó registrada, y un
 * 5xx dispararía un reintento de EasyLex por algo que no tiene que ver con la
 * firma). El archivo se intenta siempre; el envío por WhatsApp es best-effort
 * (Meta solo entrega documentos iniciados por el negocio dentro de la ventana de
 * 24 h; fuera de ella el archivo igual queda para recuperarlo desde backoffice).
 */

const BUCKET = "contratos-firmados";
// La signed URL solo tiene que vivir el tiempo que Meta tarda en descargar el
// PDF al enviar el mensaje. Una hora es holgado.
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export type DeliverSignedContractInput = {
  /** `easylex_contract_id` del intento (el documentId de EasyLex). */
  documentId: string;
  contractRequestId: string;
  contractAttemptId: string;
  employeeId: string;
  correlationId: string;
};

export type DeliverSignedContractResult = {
  archived: boolean;
  sent: boolean;
  storagePath?: string;
  error?: string;
};

export async function deliverSignedContract(
  input: DeliverSignedContractInput,
): Promise<DeliverSignedContractResult> {
  try {
    return await run(input);
  } catch (error) {
    logger.error("contract.deliver_signed.unexpected", error, {
      contractRequestId: input.contractRequestId,
      correlationId: input.correlationId,
    });
    return {
      archived: false,
      sent: false,
      error: error instanceof Error ? error.message : "Error inesperado al entregar el contrato firmado.",
    };
  }
}

async function run(input: DeliverSignedContractInput): Promise<DeliverSignedContractResult> {
  const supabase = getSupabaseAdmin();

  // 1) Descargar el PDF firmado de EasyLex.
  const download = await new EasyLexClient().getSignedDocument(input.documentId);
  if (!download.ok) {
    logger.error("contract.deliver_signed.download_failed", new Error(download.error), {
      documentId: input.documentId,
      correlationId: input.correlationId,
    });
    return { archived: false, sent: false, error: download.error };
  }

  // 2) Archivar en el bucket privado.
  const storagePath = `${input.contractRequestId}/${input.documentId}.pdf`;
  const upload = await supabase.storage.from(BUCKET).upload(storagePath, download.pdf, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (upload.error) {
    logger.error("contract.deliver_signed.archive_failed", upload.error, {
      storagePath,
      correlationId: input.correlationId,
    });
    return { archived: false, sent: false, error: upload.error.message };
  }

  const { error: pathError } = await supabase
    .from("contract_attempts")
    .update({ signed_pdf_path: storagePath })
    .eq("id", input.contractAttemptId);
  if (pathError) {
    // No es fatal: el PDF ya está archivado; solo perdemos la referencia rápida.
    logger.warn("contract.deliver_signed.path_update_failed", {
      contractAttemptId: input.contractAttemptId,
      error: pathError.message,
    });
  }

  // 3) Enviar al empleado por WhatsApp (best-effort).
  const sent = await sendToEmployee(input, storagePath);

  await recordAuditEvent({
    eventName: "contract.signed_delivered",
    entityType: "contract_requests",
    entityId: input.contractRequestId,
    employeeId: input.employeeId,
    correlationId: input.correlationId,
    source: "backend",
    summary: sent
      ? "Contrato firmado archivado y enviado al empleado por WhatsApp."
      : "Contrato firmado archivado; el envío por WhatsApp no se completó.",
    metadata: { storage_path: storagePath, sent, document_id: input.documentId },
    actorType: "system",
  });

  logger.info("contract.deliver_signed.done", {
    contractRequestId: input.contractRequestId,
    storagePath,
    sent,
    correlationId: input.correlationId,
  });

  return { archived: true, sent, storagePath };
}

async function sendToEmployee(
  input: DeliverSignedContractInput,
  storagePath: string,
): Promise<boolean> {
  const supabase = getSupabaseAdmin();

  const { data: employee } = await supabase
    .from("employees")
    .select("nombre, telefono_normalizado")
    .eq("id", input.employeeId)
    .maybeSingle();

  const to = normalizePhoneForMeta(employee?.telefono_normalizado ?? null);
  if (!to) {
    logger.warn("contract.deliver_signed.no_phone", {
      employeeId: input.employeeId,
      correlationId: input.correlationId,
    });
    return false;
  }

  // Signed URL temporal: WhatsApp descarga el PDF al momento de enviar.
  const { data: signed, error: urlError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (urlError || !signed?.signedUrl) {
    logger.error("contract.deliver_signed.signed_url_failed", urlError ?? new Error("sin signed URL"), {
      storagePath,
      correlationId: input.correlationId,
    });
    return false;
  }

  const nombre = employee?.nombre?.trim();
  const caption = `${nombre ? `${nombre}, ` : ""}aquí está tu contrato de adelanto firmado. Consérvalo para tus registros.`;

  const result = await getWhatsAppClient().sendDocument(
    to,
    signed.signedUrl,
    "contrato-firmado.pdf",
    caption,
  );

  if (!result.ok) {
    logger.error("contract.deliver_signed.whatsapp_failed", new Error(result.error ?? "desconocido"), {
      employeeId: input.employeeId,
      correlationId: input.correlationId,
    });
    return false;
  }

  logger.info("contract.deliver_signed.whatsapp_sent", {
    employeeId: input.employeeId,
    messageId: result.messageId,
    correlationId: input.correlationId,
  });
  return true;
}
