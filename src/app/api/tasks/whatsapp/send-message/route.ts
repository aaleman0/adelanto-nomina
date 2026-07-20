import { NextResponse } from "next/server";
import { z } from "zod";
import { processQueuedMessage } from "@/lib/whatsapp/bulk-send";
import { uuidParam } from "@/lib/whatsapp/schemas";
import { authenticateWorkerRequest } from "@/lib/security/cloud-tasks-auth";
import { parseJsonBody } from "@/lib/api/validation";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

const TaskPayloadSchema = z.object({
  bulkSendId: uuidParam(),
  messageId: uuidParam(),
  templateName: z.string().min(1).max(512),
});

/**
 * Worker de la cola: envía un único mensaje de WhatsApp.
 *
 * Lo invoca Cloud Tasks, no un navegador, así que la ruta es pública a nivel de
 * red y se protege con el token OIDC (ver `authenticateWorkerRequest`).
 *
 * Los códigos de respuesta importan porque determinan si Cloud Tasks reintenta:
 *
 * | Situación                        | Código | Efecto en la cola      |
 * |----------------------------------|--------|------------------------|
 * | Enviado, ya procesado o rechazado por Meta | 200 | Tarea completada  |
 * | Autenticación inválida           | 401    | Sin reintento          |
 * | Payload inválido                 | 400    | Sin reintento          |
 * | Error inesperado                 | 500    | Reintento con backoff  |
 *
 * Un rechazo de Meta devuelve 200 a propósito: ya quedó registrado como
 * `failed` en la base y reintentarlo arriesgaría enviar el mensaje dos veces.
 */
export async function POST(request: Request) {
  const auth = await authenticateWorkerRequest(request);

  if (!auth.ok) {
    logger.warn("tasks.worker.unauthorized", { reason: auth.reason });
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const parsed = await parseJsonBody(request, TaskPayloadSchema);
  if (!parsed.success) return parsed.response;

  const payload = parsed.data;

  try {
    const result = await processQueuedMessage(payload);

    logger.info("tasks.worker.processed", {
      messageId: payload.messageId,
      bulkSendId: payload.bulkSendId,
      status: result.status,
      via: auth.via,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    // Solo aquí se devuelve 500: son fallos transitorios (base de datos caída,
    // timeout) donde reintentar tiene sentido.
    logger.error("tasks.worker.error", error, {
      messageId: payload.messageId,
      bulkSendId: payload.bulkSendId,
    });

    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Error inesperado." },
      { status: 500 },
    );
  }
}
