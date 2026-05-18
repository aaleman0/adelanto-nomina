import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getWhatsAppClient } from "@/lib/whatsapp/client";
import { getEmployeesEligibility } from "@/lib/whatsapp/eligibility";
import { getEmployeesFromImport } from "@/lib/whatsapp/imports";

const BATCH_SIZE = 100;
const BATCH_DELAY_MS = 1000;

export type BulkSendParams = {
  mode: "import" | "manual";
  importId?: string;
  employeeIds?: string[];
  templateName?: string;
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
  const supabase = getSupabaseAdmin();

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
  const templateName = params.templateName ?? "adelanto_contrato";

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
      const to = emp.telefono_normalizado;

      if (!to) {
        progress.failed++;
        progress.errors.push({ employeeId: emp.employee_id, rfc: emp.rfc, error: "Sin teléfono normalizado" });
        await recordMessage({ supabase, bulkSendId, emp, status: "failed", error: "Sin teléfono normalizado" });
        continue;
      }

      const variables: Record<string, string> = {
        nombre: [emp.nombre, emp.apellidos].filter(Boolean).join(" ") || "Empleado",
        monto: emp.monto_prestamo_autorizado
          ? new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(emp.monto_prestamo_autorizado)
          : "N/A",
      };

      const result = await client.sendTemplateMessage(to, templateName, variables);

      if (result.ok) {
        progress.sent++;
        await recordMessage({ supabase, bulkSendId, emp, status: "sent", waMessageId: result.messageId });
      } else {
        progress.failed++;
        progress.errors.push({ employeeId: emp.employee_id, rfc: emp.rfc, error: result.error ?? "Error desconocido" });
        await recordMessage({ supabase, bulkSendId, emp, status: "failed", error: result.error });
      }
    }

    // Delay entre batches si no es el último
    if (i + BATCH_SIZE < eligible.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  // 5. Actualizar status del bulk_send
  await supabase
    .from("whatsapp_bulk_sends")
    .update({
      status: "completed",
      sent_count: progress.sent,
      failed_count: progress.failed,
    })
    .eq("id", bulkSendId);

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
  await params.supabase.from("whatsapp_contract_messages").insert({
    employee_id: params.emp.employee_id,
    bulk_send_id: params.bulkSendId,
    message_type: "bulk_contract_offer",
    status: params.status,
    delivery_status: params.status === "sent" ? "sent" : "failed",
    wa_message_id: params.waMessageId ?? null,
    error_message: params.error ?? null,
    whatsapp_subscriber_id: params.emp.telefono_normalizado,
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
