import { randomUUID } from "node:crypto";
import { LINK_TTL_HOURS } from "./link-ttl";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { normalizePhoneFromCsv } from "@/lib/whatsapp/phone-utils";
import { createEasyLexAttempt } from "@/lib/contracts/create-easylex-attempt";
import { sendContractLinkWhatsApp } from "@/lib/contracts/send-contract-link";
import { formatDateForDisplay } from "@/lib/contracts/format-date";
import { recordAuditEvent, recordIntegrationLog } from "@/lib/audit";
import { easylexEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

type JsonRecord = Record<string, unknown>;

type RequestContractPayload = {
  subscriber_id?: unknown;
  subscriberId?: unknown;
  first_name?: unknown;
  firstName?: unknown;
  last_name?: unknown;
  lastName?: unknown;
  phone?: unknown;
  telefono?: unknown;
  telefono_normalizado?: unknown;
  rfc?: unknown;
  RFC?: unknown;
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

type ContractRequest = {
  id: string;
  employee_id: string;
  offer_id: string;
  status: "recibida" | "generando" | "link_generado" | "firmado" | "error";
  requested_at: string;
  signed_at: string | null;
};

type ContractAttempt = {
  id: string;
  contract_request_id: string;
  attempt_number: number;
  easylex_contract_id: string | null;
  signing_url: string | null;
  status: "generando" | "generado" | "expirado" | "firmado" | "error";
  expires_at: string | null;
  generated_at: string | null;
  signed_at: string | null;
  error_message: string | null;
};

type RequestContractInput = {
  subscriberId: string;
  rfc: string;
  telefonoNormalizado: string | null;
  firstName: string | null;
  lastName: string | null;
  rawPayload: JsonRecord;
};

type RequestContractResult = {
  ok: boolean;
  status:
    | "contract_ready"
    | "contract_link_failed"
    | "already_signed"
    | "not_found"
    | "not_eligible"
    | "no_offer"
    | "invalid_request";
  message: string;
  estatus_contrato: "generado" | "firmado" | "no_disponible";
  request_id?: string;
  attempt_id?: string;
  link_easylex?: string;
  /** Si el link se envió al empleado por WhatsApp (undefined si no aplica). */
  link_enviado?: boolean;
  expires_at?: string;
  expires_at_formatted?: string;
};

export function parseRequestContractPayload(
  payload: RequestContractPayload,
): RequestContractInput {
  const subscriberId = readString(payload.subscriber_id ?? payload.subscriberId);
  const rfc = normalizeRfc(payload.rfc ?? payload.RFC);
  const telefonoNormalizado = normalizePhone(
    readString(
      payload.telefono_normalizado ?? payload.telefono ?? payload.phone,
    ),
  );

  if (!subscriberId) {
    throw new Error("subscriber_id es requerido.");
  }

  if (!rfc) {
    throw new Error("RFC es requerido.");
  }

  return {
    subscriberId,
    rfc,
    telefonoNormalizado,
    firstName: readString(payload.first_name ?? payload.firstName),
    lastName: readString(payload.last_name ?? payload.lastName),
    rawPayload: payload as JsonRecord,
  };
}

export async function requestContractFromWhatsApp(
  input: RequestContractInput,
): Promise<RequestContractResult> {
  const correlationId = randomUUID();

  const employee = await getEmployeeByRfc(input.rfc);

  if (!employee) {
    const result: RequestContractResult = {
      ok: false,
      status: "not_found",
      message: "No encontramos una oferta disponible para este RFC.",
      estatus_contrato: "no_disponible",
    };
    await createIntegrationLog({
      correlationId,
      requestPayload: sanitizePayload(input.rawPayload),
      responsePayload: result,
      success: true,
      entityType: "employees",
    });
    return result;
  }

  const offer = await getCurrentOffer(employee.id);
  await upsertWhatsAppContact(input, employee.id);

  if (!offer) {
    const result: RequestContractResult = {
      ok: false,
      status: "no_offer",
      message: "No hay una oferta vigente para generar contrato.",
      estatus_contrato: "no_disponible",
    };
    await recordWhatsAppInteraction({
      input,
      employee,
      offer: null,
      contractRequestId: null,
      correlationId,
      metadata: { result_status: result.status },
    });
    await logBusinessResult(input, employee.id, result, correlationId);
    return result;
  }

  if (!offer.is_eligible || offer.status === "rechazada") {
    const result: RequestContractResult = {
      ok: false,
      status: "not_eligible",
      message: "Tu oferta no esta disponible para solicitar adelanto.",
      estatus_contrato: "no_disponible",
    };
    await recordWhatsAppInteraction({
      input,
      employee,
      offer,
      contractRequestId: null,
      correlationId,
      metadata: { result_status: result.status },
    });
    await logBusinessResult(input, employee.id, result, correlationId);
    return result;
  }

  const bankAccount = await getActiveBankAccount(employee.id);
  const existingRequest = await getContractRequestByOffer(offer.id);
  const contractRequest =
    existingRequest ?? (await createContractRequest(employee, offer, bankAccount, input));

  if (!existingRequest) {
    await updateOfferStatus(offer.id, "solicitada");
    await createAuditEvent({
      eventName: "contract.request_created",
      entityType: "contract_requests",
      entityId: contractRequest.id,
      employeeId: employee.id,
      source: "whatsapp",
      summary: `Solicitud de contrato creada desde WhatsApp para RFC ${employee.rfc}.`,
      metadata: {
        offer_id: offer.id,
        subscriber_id: input.subscriberId,
        correlation_id: correlationId,
      },
    });
  }

  const signedAttempt = await getSignedAttempt(contractRequest.id);
  if (contractRequest.status === "firmado" || signedAttempt) {
    const result: RequestContractResult = {
      ok: true,
      status: "already_signed",
      message: "Este contrato ya fue firmado.",
      estatus_contrato: "firmado",
      request_id: contractRequest.id,
      attempt_id: signedAttempt?.id,
    };
    await recordWhatsAppInteraction({
      input,
      employee,
      offer,
      contractRequestId: contractRequest.id,
      correlationId,
      metadata: { result_status: result.status },
    });
    await logBusinessResult(input, employee.id, result, correlationId);
    return result;
  }

  const latestAttempt = await getLatestAttempt(contractRequest.id);
  const reusableAttempt = getReusableAttempt(latestAttempt);

  let attempt: ContractAttempt;
  const isReused = Boolean(reusableAttempt);

  if (reusableAttempt) {
    attempt = reusableAttempt;
  } else if (easylexEnv.isConfigured) {
    try {
      attempt = await createEasyLexAttempt(contractRequest, employee, offer, bankAccount, latestAttempt, correlationId);
    } catch (error) {
      // El proveedor de firma caído NO debe tumbar el pipeline. El intento ya
      // quedó registrado como "error" (la vista lo marca operational_status =
      // 'error'), así que el empleado cae en "Requieren acción → Con error",
      // listo para reintentar en lote cuando EasyLex vuelva. No se manda
      // WhatsApp: no hay link válido que enviar.
      return await handleContractLinkFailure({ input, employee, offer, contractRequest, correlationId, error });
    }
  } else {
    attempt = await regenerateMockAttempt(contractRequest, latestAttempt);
  }

  await updateContractRequestLinkGenerated(contractRequest.id);
  await recordWhatsAppInteraction({
    input,
    employee,
    offer,
    contractRequestId: contractRequest.id,
    correlationId,
    metadata: {
      result_status: "contract_ready",
      attempt_id: attempt.id,
      reused_link: isReused,
    },
  });

  const isEasyLex = easylexEnv.isConfigured && !isReused;

  await createAuditEvent({
    eventName: isReused
      ? "contract.link_reused"
      : latestAttempt
        ? "contract.link_regenerated"
        : "contract.link_generated",
    entityType: "contract_attempts",
    entityId: attempt.id,
    employeeId: employee.id,
    source: "backend",
    summary: isReused
      ? "Link vigente reutilizado."
      : isEasyLex
        ? "Contrato creado en EasyLex y link de firma generado."
        : "Link mock de firma generado por 2 horas.",
    metadata: {
      contract_request_id: contractRequest.id,
      offer_id: offer.id,
      expires_at: attempt.expires_at,
      correlation_id: correlationId,
      provider: isEasyLex ? "easylex" : "mock",
    },
  });

  // Enviar el link al empleado por WhatsApp. No es fatal: el contrato ya está
  // generado y el link queda en el resultado aunque el envío falle.
  const linkSend = await sendContractLinkWhatsApp({
    employeeId: employee.id,
    offerId: offer.id,
    contractRequestId: contractRequest.id,
    nombre: employee.nombre,
    telefonoNormalizado: employee.telefono_normalizado,
    monto: offer.monto_prestamo_autorizado,
    signingUrl: attempt.signing_url,
    expiresAt: attempt.expires_at,
    subscriberId: input.subscriberId,
    correlationId,
  });

  const result: RequestContractResult = {
    ok: true,
    status: "contract_ready",
    message: "Tu contrato esta listo para firma.",
    estatus_contrato: "generado",
    request_id: contractRequest.id,
    attempt_id: attempt.id,
    link_easylex: attempt.signing_url ?? undefined,
    link_enviado: linkSend.sent,
    expires_at: attempt.expires_at ?? undefined,
    expires_at_formatted: attempt.expires_at
      ? formatDateForDisplay(attempt.expires_at)
      : undefined,
  };

  await logBusinessResult(input, employee.id, result, correlationId);
  return result;
}

/**
 * El proveedor de firma (EasyLex) falló al crear el documento. El PDF se generó
 * y el intento ya quedó registrado como "error", así que el expediente aparece
 * en "Requieren acción → Con error". Se marca también la solicitud como `error`
 * (mejor mensaje en la timeline) y se devuelve un resultado suave: la operación
 * no se completó, pero el pipeline sigue y el expediente queda en la cola para
 * reintentar en lote cuando EasyLex vuelva. No se envía WhatsApp: no hay link.
 */
async function handleContractLinkFailure(params: {
  input: RequestContractInput;
  employee: Employee;
  offer: AdvanceOffer;
  contractRequest: ContractRequest;
  correlationId: string;
  error: unknown;
}): Promise<RequestContractResult> {
  const { input, employee, offer, contractRequest, correlationId, error } = params;
  const reason = error instanceof Error ? error.message : "No se pudo generar el link de firma.";

  // Best-effort: la vista ya marca 'error' por el intento; esto solo mejora el
  // estado de la solicitud y su mensaje. Si falla, no debe tumbar el manejador.
  const supabase = getSupabaseAdmin();
  const { error: updateError } = await supabase
    .from("contract_requests")
    .update({ status: "error", error_message: reason })
    .eq("id", contractRequest.id);
  if (updateError) {
    logger.warn("contract.request_error_update_failed", {
      contractRequestId: contractRequest.id,
      error: updateError.message,
    });
  }

  await createAuditEvent({
    eventName: "contract.link_failed",
    entityType: "contract_requests",
    entityId: contractRequest.id,
    employeeId: employee.id,
    source: "backend",
    summary: "El proveedor de firma no está disponible; el contrato quedó en la cola para reintentar.",
    metadata: {
      contract_request_id: contractRequest.id,
      offer_id: offer.id,
      correlation_id: correlationId,
      provider: "easylex",
      error: reason,
    },
  });

  const result: RequestContractResult = {
    ok: false,
    status: "contract_link_failed",
    message:
      "El contrato se generó, pero el link de firma no se pudo crear (proveedor no disponible). Quedó en la cola para reintentar.",
    estatus_contrato: "no_disponible",
    request_id: contractRequest.id,
  };

  await logBusinessResult(input, employee.id, result, correlationId);
  return result;
}

async function getEmployeeByRfc(rfc: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("employees")
    .select(
      "id, rfc, curp, nombre, apellido_paterno, apellido_materno, apellidos, cp_csf, telefono, telefono_normalizado, email, empleador, estado_civil, nacionalidad, lugar_origen, fecha_nacimiento, domicilio",
    )
    .eq("rfc", rfc)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as Employee | null;
}

async function getCurrentOffer(employeeId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("advance_offers")
    .select(
      "id, employee_id, monto_prestamo_autorizado, estatus_p_esta_q, estatus_conversion, estatus_cliente, is_eligible, status, source_batch_id, source_row_id",
    )
    .eq("employee_id", employeeId)
    .eq("is_current", true)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as AdvanceOffer | null;
}

async function getActiveBankAccount(employeeId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("employee_bank_accounts")
    .select("clabe, banco")
    .eq("employee_id", employeeId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as BankAccount | null;
}

async function upsertWhatsAppContact(
  input: RequestContractInput,
  employeeId: string,
) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("whatsapp_contacts").upsert(
    {
      employee_id: employeeId,
      subscriber_id: input.subscriberId,
      wa_id: input.telefonoNormalizado ?? input.subscriberId,
      telefono_normalizado: input.telefonoNormalizado,
      first_name: input.firstName,
      last_name: input.lastName,
      last_seen_at: new Date().toISOString(),
      metadata: {
        source: "request_contract_whatsapp",
      },
    },
    { onConflict: "subscriber_id" },
  );

  if (error) {
    throw error;
  }
}

async function getContractRequestByOffer(offerId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("contract_requests")
    .select("id, employee_id, offer_id, status, requested_at, signed_at")
    .eq("offer_id", offerId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as ContractRequest | null;
}

async function createContractRequest(
  employee: Employee,
  offer: AdvanceOffer,
  bankAccount: BankAccount | null,
  input: RequestContractInput,
) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("contract_requests")
    .insert({
      employee_id: employee.id,
      offer_id: offer.id,
      status: "generando",
      requested_from: "whatsapp",
      whatsapp_subscriber_id: input.subscriberId,
      contract_snapshot: {
        nombre: employee.nombre,
        apellidos: employee.apellidos,
        rfc: employee.rfc,
        curp: employee.curp,
        cp_csf: employee.cp_csf,
        telefono: employee.telefono,
        telefono_normalizado: employee.telefono_normalizado,
        email: employee.email,
        empleador: employee.empleador,
        monto_prestamo_autorizado: offer.monto_prestamo_autorizado,
        banco: bankAccount?.banco ?? null,
        clabe: bankAccount?.clabe ?? null,
        source_batch_id: offer.source_batch_id,
        source_row_id: offer.source_row_id,
      },
    })
    .select("id, employee_id, offer_id, status, requested_at, signed_at")
    .single();

  if (error) {
    throw error;
  }

  return data as ContractRequest;
}

async function updateOfferStatus(offerId: string, status: "solicitada") {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("advance_offers")
    .update({ status })
    .eq("id", offerId);

  if (error) {
    throw error;
  }
}

async function getSignedAttempt(contractRequestId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("contract_attempts")
    .select(
      "id, contract_request_id, attempt_number, easylex_contract_id, signing_url, status, expires_at, generated_at, signed_at, error_message",
    )
    .eq("contract_request_id", contractRequestId)
    .eq("status", "firmado")
    .order("signed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as ContractAttempt | null;
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

async function regenerateMockAttempt(
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

  if (
    latestAttempt &&
    latestAttempt.status === "generado" &&
    latestAttempt.expires_at &&
    new Date(latestAttempt.expires_at).getTime() <= Date.now()
  ) {
    const { error: expireError } = await supabase
      .from("contract_attempts")
      .update({ status: "expirado" })
      .eq("id", latestAttempt.id);

    if (expireError) {
      throw expireError;
    }
  }

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
      raw_response: {
        provider: "easylex_mock",
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

async function updateContractRequestLinkGenerated(contractRequestId: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("contract_requests")
    .update({ status: "link_generado" })
    .eq("id", contractRequestId);

  if (error) {
    throw error;
  }
}

async function recordWhatsAppInteraction(input: {
  input: RequestContractInput;
  employee: Employee;
  offer: AdvanceOffer | null;
  contractRequestId: string | null;
  correlationId: string;
  metadata: JsonRecord;
}) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("whatsapp_contract_messages").insert({
    employee_id: input.employee.id,
    offer_id: input.offer?.id ?? null,
    contract_request_id: input.contractRequestId,
    whatsapp_subscriber_id: input.input.subscriberId,
    message_type: "contract_offer",
    status: "click",
    delivery_status: "sent",
    clicked_at: new Date().toISOString(),
    correlation_id: input.correlationId,
    metadata: input.metadata,
  });

  if (error) {
    throw error;
  }
}

async function logBusinessResult(
  input: RequestContractInput,
  employeeId: string,
  result: RequestContractResult,
  correlationId: string,
) {
  await createIntegrationLog({
    correlationId,
    requestPayload: sanitizePayload(input.rawPayload),
    responsePayload: result,
    success: true,
    entityType: "employees",
    entityId: employeeId,
  });
}

// Delegan en el módulo de auditoría compartido; se conserva la firma para no
// tocar los llamadores. Son acciones de sistema (solicitud entrante), sin actor.
async function createIntegrationLog(input: {
  correlationId: string;
  requestPayload: JsonRecord;
  responsePayload: JsonRecord;
  success: boolean;
  entityType?: string;
  entityId?: string;
}) {
  await recordIntegrationLog({
    provider: "whatsapp",
    direction: "inbound",
    endpoint: "/api/whatsapp/request-contract",
    method: "POST",
    requestPayload: input.requestPayload,
    responsePayload: input.responsePayload,
    statusCode: 200,
    success: input.success,
    correlationId: input.correlationId,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
  });
}

async function createAuditEvent(input: {
  eventName: string;
  entityType: string;
  entityId: string;
  employeeId: string;
  source: "whatsapp" | "backend";
  summary: string;
  metadata: JsonRecord;
}) {
  await recordAuditEvent({
    eventName: input.eventName,
    entityType: input.entityType,
    entityId: input.entityId,
    employeeId: input.employeeId,
    source: input.source,
    summary: input.summary,
    metadata: input.metadata,
    actorType: "system",
  });
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function normalizeRfc(value: unknown) {
  const raw = readString(value);

  if (!raw) {
    return null;
  }

  return raw.toUpperCase().replace(/\s+/g, "");
}

function normalizePhone(value: string | null) {
  return normalizePhoneFromCsv(value ?? undefined);
}

function sanitizePayload(payload: JsonRecord) {
  return {
    subscriber_id: payload.subscriber_id ?? payload.subscriberId ?? null,
    rfc: normalizeRfc(payload.rfc ?? payload.RFC),
    telefono_normalizado: normalizePhone(
      readString(
        payload.telefono_normalizado ?? payload.telefono ?? payload.phone,
      ),
    ),
    source: "whatsapp_request_contract",
  };
}
