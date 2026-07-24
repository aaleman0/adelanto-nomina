import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { createEasyLexAttempt, type ContractAttempt } from "@/lib/contracts/create-easylex-attempt";
import { easylexEnv } from "@/lib/env";
import { recordAuditEvent } from "@/lib/audit";
import type { Actor } from "@/lib/auth/roles";

type JsonRecord = Record<string, unknown>;

type ContractRequest = {
  id: string;
  employee_id: string;
  offer_id: string;
  status: "recibida" | "generando" | "link_generado" | "firmado" | "error";
  signed_at: string | null;
};

type Employee = {
  id: string;
  rfc: string;
  curp: string | null;
  nombre: string;
  apellido_paterno: string | null;
  apellido_materno: string | null;
  apellidos: string | null;
  cp_csf: string | null;
  telefono: string;
  telefono_normalizado: string;
  email: string | null;
  empleador: string | null;
  estado_civil: string | null;
  nacionalidad: string | null;
  lugar_origen: string | null;
  fecha_nacimiento: string | null;
  domicilio: string | null;
};

type AdvanceOffer = {
  id: string;
  employee_id: string;
  monto_prestamo_autorizado: number;
  estatus_p_esta_q: string | null;
  estatus_conversion: string;
  estatus_cliente: string | null;
  is_eligible: boolean;
  status: string;
  source_batch_id: string | null;
  source_row_id: string | null;
};

type BankAccount = {
  clabe: string;
  banco: string;
};

export type BackofficeContractAction = "regenerate_expired" | "retry";

export type BackofficeContractActionResult = {
  ok: boolean;
  status:
    | "link_regenerated"
    | "link_reused"
    | "already_signed"
    | "not_found";
  message: string;
  request_id?: string;
  attempt_id?: string;
  link_easylex?: string;
  expires_at?: string;
};

const LINK_TTL_HOURS = 2;

/**
 * Tope de expedientes que procesa una sola invocación en lote.
 *
 * Cada acción llama a EasyLex (crear documento), que es lento y externo. Sin
 * tope, "regenerar los 165 vencidos" excedería el timeout del request. Se
 * procesa una tanda y el operador vuelve a pulsar para seguir; la respuesta
 * dice cuántos quedan, así que no hay truncado silencioso.
 */
export const MAX_BATCH_ACTIONS = 25;

/** Estado operativo → acción de backoffice que lo resuelve. */
const BATCH_ACTION_BY_STATUS: Record<string, BackofficeContractAction> = {
  link_expirado: "regenerate_expired",
  error: "retry",
};

export type BatchActionSummary = {
  status: string;
  action: BackofficeContractAction;
  /** Total de expedientes en ese estado (antes del tope). */
  totalInStatus: number;
  /** Cuántos se intentaron en esta tanda (≤ MAX_BATCH_ACTIONS). */
  processed: number;
  /** Acciones que hicieron algo (ok: true). */
  succeeded: number;
  /** Omitidos sin error (ya firmados, no encontrados). */
  skipped: number;
  /** Fallaron con excepción. */
  failed: number;
  /** Cuántos quedan por procesar tras esta tanda. */
  remaining: number;
};

/**
 * Ejecuta una acción de backoffice sobre todos los expedientes de un estado,
 * en tandas acotadas y tolerante a fallos individuales: un error en uno no
 * detiene el resto.
 */
export async function runBatchBackofficeAction(input: {
  status: string;
  actor?: Actor | null;
}): Promise<BatchActionSummary> {
  const action = BATCH_ACTION_BY_STATUS[input.status];
  if (!action) {
    throw new Error(`No hay acción en lote para el estado "${input.status}".`);
  }

  const supabase = getSupabaseAdmin();
  const { data, error, count } = await supabase
    .from("backoffice_contract_control_v1")
    .select("contract_request_id", { count: "exact" })
    .eq("operational_status", input.status)
    .not("contract_request_id", "is", null)
    .order("last_movement_at", { ascending: false })
    .limit(MAX_BATCH_ACTIONS);

  if (error) throw error;

  const ids = (data ?? [])
    .map((row) => row.contract_request_id as string | null)
    .filter((id): id is string => Boolean(id));

  let succeeded = 0;
  let skipped = 0;
  let failed = 0;

  for (const contractRequestId of ids) {
    try {
      const result = await runBackofficeContractAction({
        contractRequestId,
        action,
        actor: input.actor ?? null,
      });
      if (result.ok) succeeded += 1;
      else skipped += 1;
    } catch {
      // Un fallo individual (p. ej. EasyLex caído para ese expediente) no debe
      // abortar la tanda; ya queda registrado por runBackofficeContractAction.
      failed += 1;
    }
  }

  const totalInStatus = count ?? ids.length;
  return {
    status: input.status,
    action,
    totalInStatus,
    processed: ids.length,
    succeeded,
    skipped,
    failed,
    remaining: Math.max(0, totalInStatus - succeeded),
  };
}

export async function runBackofficeContractAction(input: {
  contractRequestId: string;
  action: BackofficeContractAction;
  /**
   * Operador que ejecuta la acción. Se propaga a la auditoría: sin él no se
   * puede saber quién regeneró un link o reintentó un contrato.
   */
  actor?: Actor | null;
}): Promise<BackofficeContractActionResult> {
  const correlationId = randomUUID();
  const contractRequest = await getContractRequest(input.contractRequestId);

  if (!contractRequest) {
    const result: BackofficeContractActionResult = {
      ok: false,
      status: "not_found",
      message: "No se encontro la solicitud de contrato.",
    };
    await createIntegrationLog({
      action: input.action,
      correlationId,
      requestPayload: { contract_request_id: input.contractRequestId },
      responsePayload: result,
      success: true,
    });
    return result;
  }

  const latestAttempt = await getLatestAttempt(contractRequest.id);

  if (
    contractRequest.status === "firmado" ||
    contractRequest.signed_at ||
    latestAttempt?.status === "firmado"
  ) {
    const result: BackofficeContractActionResult = {
      ok: true,
      status: "already_signed",
      message: "El contrato ya esta firmado; no se puede regenerar link.",
      request_id: contractRequest.id,
      attempt_id: latestAttempt?.id,
      link_easylex: latestAttempt?.signing_url ?? undefined,
      expires_at: latestAttempt?.expires_at ?? undefined,
    };
    await createIntegrationLog({
      action: input.action,
      correlationId,
      requestPayload: { contract_request_id: input.contractRequestId },
      responsePayload: result,
      success: true,
      entityId: contractRequest.id,
    });
    return result;
  }

  const reusableAttempt = getReusableAttempt(latestAttempt);

  if (reusableAttempt) {
    await clearContractError(contractRequest.id);

    const result: BackofficeContractActionResult = {
      ok: true,
      status: "link_reused",
      message: "El link sigue vigente; se reutilizo el intento existente.",
      request_id: contractRequest.id,
      attempt_id: reusableAttempt.id,
      link_easylex: reusableAttempt.signing_url ?? undefined,
      expires_at: reusableAttempt.expires_at ?? undefined,
    };
    await createAuditEvent({
      contractRequest,
      action: input.action,
      actor: input.actor ?? null,
      correlationId,
      previousState: contractRequest.status,
      newState: "link_generado",
      summary: "Link mock vigente reutilizado desde backoffice.",
      metadata: {
        reused_attempt_id: reusableAttempt.id,
        expires_at: reusableAttempt.expires_at,
      },
    });
    await createIntegrationLog({
      action: input.action,
      correlationId,
      requestPayload: { contract_request_id: input.contractRequestId },
      responsePayload: result,
      success: true,
      entityId: contractRequest.id,
    });
    return result;
  }

  await expireLatestAttemptIfNeeded(latestAttempt);

  let newAttempt: ContractAttempt;
  let isEasyLex = false;

  if (easylexEnv.isConfigured) {
    const [employee, offer, bankAccount] = await Promise.all([
      getEmployee(contractRequest.employee_id),
      getOffer(contractRequest.offer_id),
      getBankAccount(contractRequest.employee_id),
    ]);

    if (!employee || !offer) {
      const result: BackofficeContractActionResult = {
        ok: false,
        status: "not_found",
        message: "No se encontro el empleado u oferta asociados al contrato.",
        request_id: contractRequest.id,
      };
      await createIntegrationLog({
        action: input.action,
        correlationId,
        requestPayload: { contract_request_id: input.contractRequestId },
        responsePayload: result,
        success: false,
        entityId: contractRequest.id,
      });
      return result;
    }

    newAttempt = await createEasyLexAttempt(contractRequest, employee, offer, bankAccount, latestAttempt, correlationId);
    isEasyLex = true;
  } else {
    newAttempt = await createMockAttempt(contractRequest, latestAttempt);
  }

  await markContractRequestLinkGenerated(contractRequest);

  const result: BackofficeContractActionResult = {
    ok: true,
    status: "link_regenerated",
    message: isEasyLex ? "Link de EasyLex regenerado correctamente." : "Link mock regenerado correctamente.",
    request_id: contractRequest.id,
    attempt_id: newAttempt.id,
    link_easylex: newAttempt.signing_url ?? undefined,
    expires_at: newAttempt.expires_at ?? undefined,
  };

  await createAuditEvent({
    contractRequest,
    action: input.action,
    actor: input.actor ?? null,
    correlationId,
    previousState: contractRequest.status,
    newState: "link_generado",
    summary: isEasyLex
      ? input.action === "retry"
        ? "Reintento de EasyLex ejecutado desde backoffice."
        : "Link de EasyLex regenerado desde backoffice."
      : input.action === "retry"
        ? "Reintento mock ejecutado desde backoffice."
        : "Link mock regenerado desde backoffice.",
    metadata: {
      previous_attempt_id: latestAttempt?.id ?? null,
      previous_attempt_status: latestAttempt?.status ?? null,
      new_attempt_id: newAttempt.id,
      expires_at: newAttempt.expires_at,
      provider: isEasyLex ? "easylex" : "mock",
    },
  });
  await createIntegrationLog({
    action: input.action,
    correlationId,
    requestPayload: { contract_request_id: input.contractRequestId },
    responsePayload: result,
    success: true,
    entityId: contractRequest.id,
  });

  return result;
}

async function getContractRequest(contractRequestId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("contract_requests")
    .select("id, employee_id, offer_id, status, signed_at")
    .eq("id", contractRequestId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as ContractRequest | null;
}

async function getLatestAttempt(contractRequestId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("contract_attempts")
    .select(
      "id, contract_request_id, attempt_number, easylex_contract_id, signing_url, status, expires_at, generated_at, signed_at, error_message",
    )
    .eq("contract_request_id", contractRequestId)
    .order("attempt_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as ContractAttempt | null;
}

function getReusableAttempt(attempt: ContractAttempt | null) {
  if (
    attempt?.status === "generado" &&
    attempt.signing_url &&
    attempt.expires_at &&
    new Date(attempt.expires_at).getTime() > Date.now()
  ) {
    return attempt;
  }

  return null;
}

async function expireLatestAttemptIfNeeded(attempt: ContractAttempt | null) {
  if (
    !attempt ||
    attempt.status !== "generado" ||
    !attempt.expires_at ||
    new Date(attempt.expires_at).getTime() > Date.now()
  ) {
    return;
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("contract_attempts")
    .update({ status: "expirado" })
    .eq("id", attempt.id);

  if (error) {
    throw error;
  }
}

async function createMockAttempt(
  contractRequest: ContractRequest,
  latestAttempt: ContractAttempt | null,
) {
  const supabase = getSupabaseAdmin();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + LINK_TTL_HOURS * 60 * 60 * 1000);
  const attemptNumber = (latestAttempt?.attempt_number ?? 0) + 1;
  const attemptId = randomUUID();
  const mockContractId = `mock_${attemptId}`;
  const signingUrl = `https://mock.easylex.local/firmar/${attemptId}`;

  const { data, error } = await supabase
    .from("contract_attempts")
    .insert({
      id: attemptId,
      contract_request_id: contractRequest.id,
      attempt_number: attemptNumber,
      easylex_contract_id: mockContractId,
      signing_url: signingUrl,
      status: "generado",
      expires_at: expiresAt.toISOString(),
      generated_at: now.toISOString(),
      error_message: null,
      raw_response: {
        provider: "easylex_mock",
        source: "backoffice_action",
        contract_id: mockContractId,
        signing_url: signingUrl,
        expires_at: expiresAt.toISOString(),
      },
    })
    .select(
      "id, contract_request_id, attempt_number, easylex_contract_id, signing_url, status, expires_at, generated_at, signed_at, error_message",
    )
    .single();

  if (error) {
    throw error;
  }

  return data as ContractAttempt;
}

async function clearContractError(contractRequestId: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("contract_requests")
    .update({
      status: "link_generado",
      error_message: null,
    })
    .eq("id", contractRequestId);

  if (error) {
    throw error;
  }
}

async function markContractRequestLinkGenerated(
  contractRequest: ContractRequest,
) {
  const supabase = getSupabaseAdmin();
  const { error: requestError } = await supabase
    .from("contract_requests")
    .update({
      status: "link_generado",
      error_message: null,
    })
    .eq("id", contractRequest.id);

  if (requestError) {
    throw requestError;
  }

  const { error: offerError } = await supabase
    .from("advance_offers")
    .update({ status: "solicitada" })
    .eq("id", contractRequest.offer_id)
    .neq("status", "firmada");

  if (offerError) {
    throw offerError;
  }
}

/**
 * Delega en el módulo compartido de auditoría, aplicando los campos fijos de
 * las acciones de backoffice.
 */
async function createAuditEvent(input: {
  contractRequest: ContractRequest;
  action: BackofficeContractAction;
  actor?: Actor | null;
  correlationId: string;
  previousState: string;
  newState: string;
  summary: string;
  metadata: JsonRecord;
}) {
  await recordAuditEvent({
    eventName:
      input.action === "retry"
        ? "contract.retry_backoffice"
        : "contract.link_regenerated_backoffice",
    entityType: "contract_requests",
    entityId: input.contractRequest.id,
    employeeId: input.contractRequest.employee_id,
    correlationId: input.correlationId,
    source: "backoffice",
    previousState: input.previousState,
    newState: input.newState,
    summary: input.summary,
    metadata: input.metadata,
    actor: input.actor ?? null,
    actorType: "internal_operator",
  });
}

async function createIntegrationLog(input: {
  action: BackofficeContractAction;
  correlationId: string;
  requestPayload: JsonRecord;
  responsePayload: JsonRecord;
  success: boolean;
  entityId?: string;
}) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("integration_logs").insert({
    provider: "backend",
    direction: "internal",
    endpoint: `/api/backoffice/contracts/:id/${input.action}`,
    method: "POST",
    request_payload: {
      ...input.requestPayload,
      action: input.action,
    },
    response_payload: input.responsePayload,
    status_code: 200,
    status: input.success ? "success" : "failed",
    success: input.success,
    correlation_id: input.correlationId,
    entity_type: "contract_requests",
    entity_id: input.entityId ?? null,
  });

  if (error) {
    throw error;
  }
}

async function getEmployee(employeeId: string): Promise<Employee | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("employees")
    .select(
      "id, rfc, curp, nombre, apellido_paterno, apellido_materno, apellidos, cp_csf, telefono, telefono_normalizado, email, empleador, estado_civil, nacionalidad, lugar_origen, fecha_nacimiento, domicilio",
    )
    .eq("id", employeeId)
    .maybeSingle();

  if (error) throw error;
  return data as Employee | null;
}

async function getOffer(offerId: string): Promise<AdvanceOffer | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("advance_offers")
    .select(
      "id, employee_id, monto_prestamo_autorizado, estatus_p_esta_q, estatus_conversion, estatus_cliente, is_eligible, status, source_batch_id, source_row_id",
    )
    .eq("id", offerId)
    .maybeSingle();

  if (error) throw error;
  return data as AdvanceOffer | null;
}

async function getBankAccount(employeeId: string): Promise<BankAccount | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("employee_bank_accounts")
    .select("clabe, banco")
    .eq("employee_id", employeeId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw error;
  return data as BankAccount | null;
}
