"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  type BackofficeContractAction,
  runBackofficeContractAction,
} from "@/lib/contracts/backoffice-actions";
import {
  parseRequestContractPayload,
  requestContractFromWhatsApp,
} from "@/lib/contracts/request-contract";
import { deliverSignedContract } from "@/lib/contracts/deliver-signed-contract";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/roles";

export async function regenerateContractLinkAction(formData: FormData) {
  await runContractAction(formData, "regenerate_expired");
}

export async function retryContractFlowAction(formData: FormData) {
  await runContractAction(formData, "retry");
}

/**
 * "Solicitar contrato" desde el backoffice: dispara la generación del contrato
 * que antes iniciaba el empleado por WhatsApp (vía ManyChat, ya retirado). Genera
 * el documento en EasyLex y le envía el link de firma al empleado. Si ya hay un
 * link vigente, `requestContractFromWhatsApp` lo reutiliza (no gasta otra firma).
 *
 * Es el disparador operativo que faltaba: sin él, no había forma de arrancar un
 * contrato desde la UI.
 */
export async function requestContractAction(formData: FormData) {
  const employeeId = readFormValue(formData, "employee_id");
  const rfc = readFormValue(formData, "rfc");
  const telefono = readFormValue(formData, "telefono_normalizado");

  if (!employeeId || !rfc) {
    redirect("/");
  }

  // Las server actions no pasan por `src/proxy.ts`: el rol se valida aquí.
  const auth = await requireRole("operaciones");
  if (!auth.ok) {
    redirect(`/contracts/${employeeId}?action_status=forbidden`);
  }

  const detailPath = `/contracts/${employeeId}`;
  let status: string;
  try {
    const input = parseRequestContractPayload({
      // El operador dispara la solicitud a nombre del empleado; el teléfono
      // normalizado hace de identificador de contacto (wa_id).
      subscriber_id: telefono ?? rfc,
      rfc,
      telefono_normalizado: telefono ?? undefined,
    });
    const result = await requestContractFromWhatsApp(input);
    status = result.status;
  } catch {
    status = "contract_error";
  }

  revalidatePath("/");
  revalidatePath(detailPath);
  redirect(`${detailPath}?action_status=${status}`);
}

/**
 * Reenvía al empleado su contrato ya firmado (re-archiva + WhatsApp). Útil
 * cuando la entrega automática falló (fuera de la ventana de 24 h, token de
 * WhatsApp caído, etc.). Reutiliza `deliverSignedContract`, así que el archivo
 * queda al día y el envío se reintenta.
 */
export async function resendSignedContractAction(formData: FormData) {
  const contractRequestId = readFormValue(formData, "contract_request_id");
  const employeeId = readFormValue(formData, "employee_id");

  if (!contractRequestId || !employeeId) {
    redirect("/");
  }

  const auth = await requireRole("operaciones");
  if (!auth.ok) {
    redirect(`/contracts/${employeeId}?action_status=forbidden`);
  }

  const supabase = getSupabaseAdmin();
  const { data: attempt } = await supabase
    .from("contract_attempts")
    .select("id, easylex_contract_id")
    .eq("contract_request_id", contractRequestId)
    .eq("status", "firmado")
    .order("attempt_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!attempt?.easylex_contract_id) {
    redirect(`/contracts/${employeeId}?action_status=not_found`);
  }

  const result = await deliverSignedContract({
    documentId: attempt.easylex_contract_id,
    contractRequestId,
    contractAttemptId: attempt.id,
    employeeId,
    correlationId: randomUUID(),
  });

  revalidatePath(`/contracts/${employeeId}`);
  redirect(
    `/contracts/${employeeId}?action_status=${result.sent ? "contract_resent" : "contract_resend_failed"}`,
  );
}

async function runContractAction(
  formData: FormData,
  action: BackofficeContractAction,
) {
  const contractRequestId = readFormValue(formData, "contract_request_id");
  const employeeId = readFormValue(formData, "employee_id");

  if (!contractRequestId || !employeeId) {
    redirect("/");
  }

  // Las server actions no pasan por `src/proxy.ts`, así que el rol se
  // comprueba aquí igual que en los route handlers.
  const auth = await requireRole("operaciones");
  if (!auth.ok) {
    redirect(`/contracts/${employeeId}?action_status=forbidden`);
  }

  const result = await runBackofficeContractAction({
    contractRequestId,
    action,
    actor: auth.actor,
  });
  const detailPath = `/contracts/${employeeId}`;

  revalidatePath("/");
  revalidatePath(detailPath);
  redirect(`${detailPath}?action_status=${result.status}`);
}

function readFormValue(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" && value.trim() ? value.trim() : null;
}
