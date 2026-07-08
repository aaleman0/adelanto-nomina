import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getWhatsAppClient, type TemplateComponent } from "@/lib/whatsapp/client";
import { getEmployeesEligibility } from "@/lib/whatsapp/eligibility";
import { getEmployeesFromImport } from "@/lib/whatsapp/imports";
import { normalizePhoneForMeta } from "@/lib/whatsapp/phone-utils";
import { logger } from "@/lib/logger";

const BATCH_SIZE = 100;
const BATCH_DELAY_MS = 1000;

export type BulkSendParams = {
  mode: "import" | "manual";
  importId?: string;
  employeeIds?: string[];
  templateName?: string;
  buttonConfig?: {
    text: string;
    url: string;
  };
};

export type BulkSendProgress = {
  total: number;
  eligible: number;
  sent: number;
  failed: number;
  errors: Array<{ employeeId: string; rfc?: string | null; error: string }>;
};

export type BulkSendResult = BulkSendProgress & {
  bulkSendId: string;
  status: "completed" | "failed";
};

export async function validateBulkEligibility(params: { mode: "import" | "manual"; importId?: string; employeeIds?: string[] }) {
  let ids: string[] = params.employeeIds ?? [];

  if (params.mode === "import" && params.importId) {
    const employees = await getEmployeesFromImport(params.importId);
    ids = employees.map((e) => e.employee_id);
  }

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

  // 1. Obtener lista de employees
  let employeeIds: string[] = params.employeeIds ?? [];
  if (params.mode === "import" && params.importId) {
    const employees = await getEmployeesFromImport(params.importId);
    employeeIds = employees.map((e) => e.employee_id);
  }

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
      const to = normalizePhoneForMeta(emp.telefono_normalizado);

      if (!to) {
        progress.failed++;
        progress.errors.push({ employeeId: emp.employee_id, rfc: emp.rfc, error: "Sin teléfono normalizado" });
        try {
          await recordMessage({ supabase, bulkSendId, emp, status: "failed", error: "Sin teléfono normalizado" });
        } catch (recordError) {
          progress.errors.push({ 
            employeeId: emp.employee_id, 
            rfc: emp.rfc, 
            error: `Error al registrar mensaje: ${recordError instanceof Error ? recordError.message : 'Error desconocido'}` 
          });
        }
        continue;
      }

      const monto = emp.monto_prestamo_autorizado
        ? new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 }).format(emp.monto_prestamo_autorizado)
        : "N/A";

      const variables: Record<string, string> =
        templateName === "adelanto_nomina"
          ? { "1": emp.nombre || "Empleado", "2": monto }
          : { "1": emp.nombre || "Empleado", "2": emp.empleador || "Tu empresa", "3": monto };

      // Para adelanto_nomina_v2: header de imagen + body con 3 variables.
      // Meta renderiza el botón de URL fija automáticamente.
      const headerImageUrl = process.env.WHATSAPP_TEMPLATE_HEADER_IMAGE_URL;
      const components: TemplateComponent[] = [
        {
          type: "body",
          parameters: Object.entries(variables).map(([, value]) => ({
            type: "text",
            text: value,
          })),
        },
      ];

      if (headerImageUrl && templateName === "adelanto_nomina_v2") {
        components.unshift({
          type: "header",
          parameters: [{ type: "image", image: { link: headerImageUrl } }],
        });
      }

      const result = await client.sendTemplateMessage(to, templateName, variables, components);

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
