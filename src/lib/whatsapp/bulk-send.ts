import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getWhatsAppClient } from "@/lib/whatsapp/client";
import { getEmployeesEligibility } from "@/lib/whatsapp/eligibility";
import { getEmployeesFromImport } from "@/lib/whatsapp/imports";
import { buildBulkTemplateMessage, DEFAULT_BULK_TEMPLATE } from "@/lib/whatsapp/message-builder";
import { logger } from "@/lib/logger";

const BATCH_SIZE = 100;
const BATCH_DELAY_MS = 1000;

export type BulkSendMode = "import" | "manual" | "status";

export type BulkSendParams = {
  mode: BulkSendMode;
  importId?: string;
  employeeIds?: string[];
  /** Estado operativo a enviar en bloque cuando mode === "status". */
  status?: string;
  templateName?: string;
  buttonConfig?: {
    text: string;
    url: string;
  };
};

/**
 * IDs de todos los empleados en un estado operativo. Sostiene la acción en lote
 * por etapa del embudo: enviar a "todos los por contactar" sin depender de la
 * página visible ni de mandar cientos de IDs desde el cliente.
 */
async function getEmployeeIdsByStatus(status: string): Promise<string[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("backoffice_contract_control_v1")
    .select("employee_id")
    .eq("operational_status", status);
  if (error) throw error;
  return (data ?? []).map((row) => row.employee_id as string);
}

/** Resuelve los IDs de destinatarios según el modo. */
async function resolveEmployeeIds(params: {
  mode: BulkSendMode;
  importId?: string;
  employeeIds?: string[];
  status?: string;
}): Promise<string[]> {
  if (params.mode === "import" && params.importId) {
    const employees = await getEmployeesFromImport(params.importId);
    return employees.map((e) => e.employee_id);
  }
  if (params.mode === "status" && params.status) {
    return getEmployeeIdsByStatus(params.status);
  }
  return params.employeeIds ?? [];
}

export type BulkSendProgress = {
  total: number;
  eligible: number;
  sent: number;
  failed: number;
  errors: Array<{ employeeId: string; rfc?: string | null; error: string }>;
};

export type BulkSendResult = BulkSendProgress & {
  bulkSendId: string;
  /**
   * `queued` significa que los mensajes se encolaron y se enviarán de forma
   * asíncrona: en ese caso `sent` y `failed` valen 0 y hay que consultar el
   * detalle del envío para conocer el avance real.
   */
  status: "completed" | "failed" | "queued";
  queued?: number;
};

export async function validateBulkEligibility(params: { mode: BulkSendMode; importId?: string; employeeIds?: string[]; status?: string }) {
  const ids = await resolveEmployeeIds(params);

  const eligibility = await getEmployeesEligibility(ids);

  return {
    total: eligibility.length,
    eligible: eligibility.filter((e) => e.eligible).length,
    employees: eligibility,
  };
}

export async function sendBulkMessages(params: BulkSendParams): Promise<BulkSendResult> {
  const supabase = getSupabaseAdmin();
  const client = getWhatsAppClient();
  const templateName = params.templateName ?? "adelanto_nomina_v2";

  // Barrido oportunista de envíos previos atascados en 'sending'.
  await sweepStuckBulkSends();

  // 1. Obtener lista de employees
  const employeeIds = await resolveEmployeeIds(params);

  // 2. Validar elegibilidad de cada uno
  const eligibility = await getEmployeesEligibility(employeeIds);
  const eligible = eligibility.filter((e) => e.eligible);

  // 3. Crear registro en whatsapp_bulk_sends
  const { data: bulkSendData, error: bulkError } = await supabase
    .from("whatsapp_bulk_sends")
    .insert({
      mode: params.mode,
      import_id: params.importId ?? null,
      employee_ids: employeeIds,
      eligible_count: eligible.length,
      status: "sending",
    })
    .select("id")
    .single();

  if (bulkError) throw bulkError;

  const bulkSendId = bulkSendData.id as string;
  logger.info("whatsapp.bulk_send.started", {
    bulkSendId,
    mode: params.mode,
    importId: params.importId,
    totalEmployees: employeeIds.length,
    eligibleCount: eligible.length,
    templateName,
    hasButton: !!params.buttonConfig,
    buttonText: params.buttonConfig?.text,
    buttonUrl: params.buttonConfig?.url,
  });

  const progress: BulkSendProgress = {
    total: employeeIds.length,
    eligible: eligible.length,
    sent: 0,
    failed: 0,
    errors: [],
  };

  // 4. Enviar mensajes en batches
  for (let i = 0; i < eligible.length; i += BATCH_SIZE) {
    const batch = eligible.slice(i, i + BATCH_SIZE);

    for (const emp of batch) {
      const built = buildBulkTemplateMessage(emp, templateName, {
        headerImageUrl: process.env.WHATSAPP_TEMPLATE_HEADER_IMAGE_URL,
      });

      if (!built.ok) {
        progress.failed++;
        progress.errors.push({ employeeId: emp.employee_id, rfc: emp.rfc, error: built.error });
        try {
          await recordMessage({ supabase, bulkSendId, emp, status: "failed", error: built.error });
        } catch (recordError) {
          progress.errors.push({
            employeeId: emp.employee_id,
            rfc: emp.rfc,
            error: `Error al registrar mensaje: ${recordError instanceof Error ? recordError.message : 'Error desconocido'}`,
          });
        }
        continue;
      }

      const result = await client.sendTemplateMessage(
        built.to,
        templateName,
        built.variables,
        built.components,
      );

      if (result.ok) {
        progress.sent++;
        try {
          await recordMessage({ supabase, bulkSendId, emp, status: "sent", waMessageId: result.messageId });
        } catch (recordError) {
          progress.sent--; // Revertir el contador si falló el registro
          progress.failed++;
          progress.errors.push({ 
            employeeId: emp.employee_id, 
            rfc: emp.rfc, 
            error: `Mensaje enviado pero error al registrar: ${recordError instanceof Error ? recordError.message : 'Error desconocido'}` 
          });
          logger.error("whatsapp.message.record_failed", recordError instanceof Error ? recordError : new Error(String(recordError)), {
            bulkSendId,
            employeeId: emp.employee_id,
            rfc: emp.rfc,
            waMessageId: result.messageId,
          });
        }
      } else {
        progress.failed++;
        const errMsg = result.error ?? "Error desconocido";
        progress.errors.push({ employeeId: emp.employee_id, rfc: emp.rfc, error: errMsg });
        logger.warn("whatsapp.message.send_failed", {
          bulkSendId,
          employeeId: emp.employee_id,
          rfc: emp.rfc,
          error: errMsg,
        });
        try {
          await recordMessage({ supabase, bulkSendId, emp, status: "failed", error: result.error });
        } catch (recordError) {
          progress.errors.push({ 
            employeeId: emp.employee_id, 
            rfc: emp.rfc, 
            error: `Error al registrar fallo: ${recordError instanceof Error ? recordError.message : 'Error desconocido'}` 
          });
        }
      }
    }

    // Delay entre batches si no es el último
    if (i + BATCH_SIZE < eligible.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  // 5. Verificar consistencia antes de actualizar
  const { data: actualMessages, error: verifyError } = await supabase
    .from("whatsapp_contract_messages")
    .select("id, status")
    .eq("bulk_send_id", bulkSendId);

  if (verifyError) {
    logger.error("whatsapp.bulk_send.verify_error", verifyError, { bulkSendId });
  } else {
    const actualSent = actualMessages?.filter(m => m.status === "sent").length ?? 0;
    const actualFailed = actualMessages?.filter(m => m.status === "failed").length ?? 0;
    
    if (actualSent !== progress.sent || actualFailed !== progress.failed) {
      logger.error("whatsapp.bulk_send.count_mismatch", {
        bulkSendId,
        expected_sent: progress.sent,
        expected_failed: progress.failed,
        actual_sent: actualSent,
        actual_failed: actualFailed,
        total_messages: actualMessages?.length ?? 0,
      });
      // Usar los contadores reales de la BD
      progress.sent = actualSent;
      progress.failed = actualFailed;
    }
  }

  // 6. Actualizar status del bulk_send
  await supabase
    .from("whatsapp_bulk_sends")
    .update({
      status: "completed",
      sent_count: progress.sent,
      failed_count: progress.failed,
    })
    .eq("id", bulkSendId);

  // 7. Alerta de error rate: si >10% de elegibles fallaron, emitir warn
  const totalAttempted = progress.sent + progress.failed;
  if (totalAttempted > 0) {
    const errorRate = Math.round((progress.failed / totalAttempted) * 100);
    if (errorRate > 10) {
      logger.warn("whatsapp.bulk_send.high_error_rate", {
        bulkSendId,
        errorRate,
        sent: progress.sent,
        failed: progress.failed,
        totalAttempted,
        threshold: 10,
        action: "Revisar configuración de WhatsApp API o lista de teléfonos.",
      });
    }
  }

  return { ...progress, bulkSendId, status: "completed" };
}

async function recordMessage(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  bulkSendId: string;
  emp: { employee_id: string; telefono_normalizado: string | null; rfc?: string | null };
  status: "sent" | "failed";
  waMessageId?: string;
  error?: string;
}) {
  const { error } = await params.supabase.from("whatsapp_contract_messages").insert({
    employee_id: params.emp.employee_id,
    bulk_send_id: params.bulkSendId,
    message_type: "bulk_contract_offer",
    status: params.status,
    delivery_status: params.status === "sent" ? "sent" : "failed",
    wa_message_id: params.waMessageId ?? null,
    error_message: params.error ?? null,
    whatsapp_subscriber_id: params.emp.telefono_normalizado,
  });

  if (error) {
    logger.error("whatsapp.record_message.error", error, {
      bulkSendId: params.bulkSendId,
      employeeId: params.emp.employee_id,
      rfc: params.emp.rfc,
      status: params.status,
      telefono_normalizado: params.emp.telefono_normalizado,
    });
    throw new Error(`No se pudo registrar el mensaje en whatsapp_contract_messages: ${error.message}`);
  }

  logger.info("whatsapp.record_message.success", {
    bulkSendId: params.bulkSendId,
    employeeId: params.emp.employee_id,
    rfc: params.emp.rfc,
    status: params.status,
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Camino asíncrono: encolar en vez de enviar dentro del request
// ---------------------------------------------------------------------------

export const WHATSAPP_SEND_WORKER_PATH = "/api/tasks/whatsapp/send-message";

/** Estados no terminales de un mensaje encolado. */
const QUEUED_STATUS = "queued";
const SENDING_STATUS = "sending";

export type QueuedMessagePayload = {
  bulkSendId: string;
  messageId: string;
  templateName: string;
};

/**
 * Prepara un envío masivo y lo encola.
 *
 * A diferencia de `sendBulkMessages`, devuelve en cuanto las tareas están en la
 * cola. Los mensajes se crean por adelantado en estado `queued` con un snapshot
 * de los datos del empleado, de modo que:
 *
 * - el worker no necesita volver a consultar al empleado;
 * - un cambio de datos a mitad del envío no altera mensajes ya encolados;
 * - cada fila sirve de registro de idempotencia (ver `processQueuedMessage`).
 */
export async function enqueueBulkSend(
  params: BulkSendParams,
  driver: { enqueue: (path: string, tasks: Array<{ id: string; payload: Record<string, unknown> }>) => Promise<{ enqueued: number; failed: number; errors: Array<{ id: string; error: string }> }> },
): Promise<BulkSendResult> {
  const supabase = getSupabaseAdmin();
  const templateName = params.templateName ?? DEFAULT_BULK_TEMPLATE;

  // Barrido oportunista de envíos previos atascados en 'sending'.
  await sweepStuckBulkSends();

  const employeeIds = await resolveEmployeeIds(params);

  const eligibility = await getEmployeesEligibility(employeeIds);
  const eligible = eligibility.filter((e) => e.eligible);

  const { data: bulkSendData, error: bulkError } = await supabase
    .from("whatsapp_bulk_sends")
    .insert({
      mode: params.mode,
      import_id: params.importId ?? null,
      employee_ids: employeeIds,
      eligible_count: eligible.length,
      status: "sending",
    })
    .select("id")
    .single();

  if (bulkError) throw bulkError;

  const bulkSendId = bulkSendData.id as string;

  logger.info("whatsapp.bulk_send.started", {
    bulkSendId,
    mode: params.mode,
    importId: params.importId,
    totalEmployees: employeeIds.length,
    eligibleCount: eligible.length,
    templateName,
    transport: "queue",
  });

  const progress: BulkSendProgress = {
    total: employeeIds.length,
    eligible: eligible.length,
    sent: 0,
    failed: 0,
    errors: [],
  };

  if (eligible.length === 0) {
    await supabase
      .from("whatsapp_bulk_sends")
      .update({ status: "completed", sent_count: 0, failed_count: 0 })
      .eq("id", bulkSendId);

    return { ...progress, bulkSendId, status: "completed", queued: 0 };
  }

  // Crear las filas de mensaje por adelantado, con snapshot del destinatario.
  const { data: created, error: createError } = await supabase
    .from("whatsapp_contract_messages")
    .insert(
      eligible.map((emp) => ({
        employee_id: emp.employee_id,
        bulk_send_id: bulkSendId,
        message_type: "bulk_contract_offer",
        status: QUEUED_STATUS,
        delivery_status: null,
        whatsapp_subscriber_id: emp.telefono_normalizado,
        metadata: {
          template_name: templateName,
          recipient: {
            employee_id: emp.employee_id,
            nombre: emp.nombre ?? null,
            empleador: emp.empleador ?? null,
            rfc: emp.rfc ?? null,
            telefono_normalizado: emp.telefono_normalizado ?? null,
            monto_prestamo_autorizado: emp.monto_prestamo_autorizado ?? null,
          },
        },
      })),
    )
    .select("id");

  if (createError) throw createError;

  const tasks = (created ?? []).map((row) => ({
    id: row.id as string,
    payload: {
      bulkSendId,
      messageId: row.id as string,
      templateName,
    } satisfies QueuedMessagePayload as unknown as Record<string, unknown>,
  }));

  const enqueueResult = await driver.enqueue(WHATSAPP_SEND_WORKER_PATH, tasks);

  // Las tareas que no se pudieron encolar se marcan como fallidas de inmediato:
  // de lo contrario quedarían en `queued` para siempre y el envío nunca se
  // daría por completado.
  if (enqueueResult.failed > 0) {
    const failedIds = enqueueResult.errors.map((e) => e.id);

    await supabase
      .from("whatsapp_contract_messages")
      .update({
        status: "failed",
        delivery_status: "failed",
        error_message: "No se pudo encolar el mensaje.",
      })
      .in("id", failedIds);

    progress.failed = enqueueResult.failed;
    progress.errors = enqueueResult.errors.map((e) => ({
      employeeId: e.id,
      error: e.error,
    }));

    logger.error("whatsapp.bulk_send.enqueue_partial_failure", null, {
      bulkSendId,
      enqueued: enqueueResult.enqueued,
      failed: enqueueResult.failed,
    });
  }

  return {
    ...progress,
    bulkSendId,
    status: "queued",
    queued: enqueueResult.enqueued,
  };
}

export type ProcessQueuedMessageResult =
  | { status: "sent"; messageId: string }
  | { status: "failed"; messageId: string; error: string }
  | { status: "skipped"; messageId: string; reason: string };

/**
 * Procesa una tarea de la cola: envía un único mensaje.
 *
 * Cloud Tasks garantiza entrega *al menos una vez*, así que esta función debe
 * ser idempotente. Lo consigue reclamando la fila con un UPDATE condicional
 * (`queued` → `sending`): solo un intento gana la carrera, el resto sale por
 * `skipped` sin volver a llamar a Meta.
 */
export async function processQueuedMessage(
  payload: QueuedMessagePayload,
): Promise<ProcessQueuedMessageResult> {
  const supabase = getSupabaseAdmin();
  const { messageId, bulkSendId, templateName } = payload;

  // Reclamo atómico. Postgres resuelve el UPDATE ... WHERE status='queued'
  // bajo un único bloqueo de fila, así que dos workers no pueden ganarlo.
  const { data: claimed, error: claimError } = await supabase
    .from("whatsapp_contract_messages")
    .update({ status: SENDING_STATUS })
    .eq("id", messageId)
    .eq("status", QUEUED_STATUS)
    .select("id, employee_id, metadata")
    .maybeSingle();

  if (claimError) throw claimError;

  if (!claimed) {
    logger.info("whatsapp.queue.message_already_processed", { messageId, bulkSendId });
    return { status: "skipped", messageId, reason: "already_processed" };
  }

  const metadata = (claimed.metadata ?? {}) as {
    recipient?: {
      employee_id: string;
      nombre: string | null;
      empleador: string | null;
      rfc: string | null;
      telefono_normalizado: string | null;
      monto_prestamo_autorizado: number | null;
    };
  };

  const recipient = metadata.recipient;

  if (!recipient) {
    await markMessageFailed(messageId, bulkSendId, "Snapshot del destinatario ausente.");
    return { status: "failed", messageId, error: "Snapshot del destinatario ausente." };
  }

  const built = buildBulkTemplateMessage(recipient, templateName, {
    headerImageUrl: process.env.WHATSAPP_TEMPLATE_HEADER_IMAGE_URL,
  });

  if (!built.ok) {
    await markMessageFailed(messageId, bulkSendId, built.error);
    return { status: "failed", messageId, error: built.error };
  }

  const client = getWhatsAppClient();
  const result = await client.sendTemplateMessage(
    built.to,
    templateName,
    built.variables,
    built.components,
  );

  if (!result.ok) {
    const error = result.error ?? "Error desconocido";
    await markMessageFailed(messageId, bulkSendId, error);
    logger.warn("whatsapp.message.send_failed", {
      bulkSendId,
      messageId,
      employeeId: claimed.employee_id,
      error,
    });
    return { status: "failed", messageId, error };
  }

  await supabase
    .from("whatsapp_contract_messages")
    .update({
      status: "sent",
      delivery_status: "sent",
      wa_message_id: result.messageId ?? null,
      error_message: null,
    })
    .eq("id", messageId);

  await supabase.rpc("increment_bulk_send_counter", {
    p_bulk_send_id: bulkSendId,
    p_field: "sent_count",
  });

  await finalizeBulkSendIfDone(bulkSendId);

  return { status: "sent", messageId };
}

async function markMessageFailed(messageId: string, bulkSendId: string, error: string) {
  const supabase = getSupabaseAdmin();

  await supabase
    .from("whatsapp_contract_messages")
    .update({ status: "failed", delivery_status: "failed", error_message: error })
    .eq("id", messageId);

  await supabase.rpc("increment_bulk_send_counter", {
    p_bulk_send_id: bulkSendId,
    p_field: "failed_count",
  });

  await finalizeBulkSendIfDone(bulkSendId);
}

/**
 * Marca el envío como completado cuando ya no quedan mensajes pendientes.
 *
 * Es idempotente a propósito: si dos workers terminan a la vez, ambos pueden
 * ejecutar la actualización y el resultado es el mismo.
 */
async function finalizeBulkSendIfDone(bulkSendId: string) {
  const supabase = getSupabaseAdmin();

  const { count: pending, error } = await supabase
    .from("whatsapp_contract_messages")
    .select("id", { count: "exact", head: true })
    .eq("bulk_send_id", bulkSendId)
    .in("status", [QUEUED_STATUS, SENDING_STATUS]);

  if (error) {
    logger.error("whatsapp.queue.finalize_check_failed", error, { bulkSendId });
    return;
  }

  if ((pending ?? 0) > 0) return;

  const { data: counts } = await supabase
    .from("whatsapp_contract_messages")
    .select("status")
    .eq("bulk_send_id", bulkSendId);

  const sent = (counts ?? []).filter((m) => m.status === "sent").length;
  const failed = (counts ?? []).filter((m) => m.status === "failed").length;

  await supabase
    .from("whatsapp_bulk_sends")
    .update({ status: "completed", sent_count: sent, failed_count: failed })
    .eq("id", bulkSendId);

  const totalAttempted = sent + failed;
  if (totalAttempted > 0) {
    const errorRate = Math.round((failed / totalAttempted) * 100);
    if (errorRate > 10) {
      logger.warn("whatsapp.bulk_send.high_error_rate", {
        bulkSendId,
        errorRate,
        sent,
        failed,
        totalAttempted,
        threshold: 10,
        action: "Revisar configuración de WhatsApp API o lista de teléfonos.",
      });
    }
  }

  logger.info("whatsapp.bulk_send.completed", { bulkSendId, sent, failed });
}

/** Un envío masivo lleva demasiado en 'sending' → se considera atascado. */
const STUCK_BULK_TIMEOUT_MIN = 30;

/**
 * Reconcilia envíos masivos atascados en 'sending' más allá del timeout: cierra
 * los fallos silenciosos donde el proceso murió a mitad (inline) o el worker
 * cayó tras entregar a Meta (cola), dejando el bulk 'sending' para siempre.
 *
 * Marca como `failed` los mensajes que nunca completaron (queued/sending) y
 * finaliza el bulk recomputando contadores. Compromiso conocido: un mensaje que
 * se entregó a Meta justo antes de un crash quedaría marcado failed; el timeout
 * largo hace raro ese caso y es preferible a un bulk atascado sin resolución.
 *
 * Es idempotente y no lanza: se invoca de forma oportunista al iniciar un envío.
 */
export async function reconcileStuckBulkSends(
  olderThanMinutes = STUCK_BULK_TIMEOUT_MIN,
): Promise<{ reconciled: number }> {
  const supabase = getSupabaseAdmin();
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000).toISOString();

  const { data: stuck, error } = await supabase
    .from("whatsapp_bulk_sends")
    .select("id")
    .eq("status", "sending")
    .lt("created_at", cutoff);

  if (error) {
    logger.error("whatsapp.bulk_send.reconcile_query_failed", error);
    return { reconciled: 0 };
  }
  if (!stuck || stuck.length === 0) return { reconciled: 0 };

  for (const row of stuck) {
    const bulkSendId = row.id as string;
    await supabase
      .from("whatsapp_contract_messages")
      .update({
        status: "failed",
        delivery_status: "failed",
        error_message: "Reconciliado: el envío no completó dentro del timeout.",
      })
      .eq("bulk_send_id", bulkSendId)
      .in("status", [QUEUED_STATUS, SENDING_STATUS]);

    await finalizeBulkSendIfDone(bulkSendId);
    logger.warn("whatsapp.bulk_send.reconciled_stuck", { bulkSendId, olderThanMinutes });
  }

  return { reconciled: stuck.length };
}

/** Barrido oportunista, no fatal: nunca debe bloquear ni tumbar un envío. */
async function sweepStuckBulkSends(): Promise<void> {
  try {
    await reconcileStuckBulkSends();
  } catch (error) {
    logger.error(
      "whatsapp.bulk_send.reconcile_failed",
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}
