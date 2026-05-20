import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/server";

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
  apellidos: string | null;
  cp_csf: string | null;
  telefono: string;
  telefono_normalizado: string;
  email: string | null;
  empleador: string | null;
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
  expires_at?: string;
  expires_at_formatted?: string;
};

const LINK_TTL_HOURS = 2;

function formatDateForDisplay(isoDate: string): string {
  const date = new Date(isoDate);
  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Mexico_City",
  };
  return date.toLocaleDateString("es-MX", options);
}

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
  const attempt = reusableAttempt ?? (await regenerateMockAttempt(contractRequest, latestAttempt));

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
      reused_link: Boolean(reusableAttempt),
    },
  });

  await createAuditEvent({
    eventName: reusableAttempt
      ? "contract.link_reused"
      : latestAttempt
        ? "contract.link_regenerated"
        : "contract.link_generated",
    entityType: "contract_attempts",
    entityId: attempt.id,
    employeeId: employee.id,
    source: "backend",
    summary: reusableAttempt
      ? "Link mock vigente reutilizado."
      : "Link mock de firma generado por 2 horas.",
    metadata: {
      contract_request_id: contractRequest.id,
      offer_id: offer.id,
      expires_at: attempt.expires_at,
      correlation_id: correlationId,
    },
  });

  const result: RequestContractResult = {
    ok: true,
    status: "contract_ready",
    message: "Tu contrato esta listo para firma.",
    estatus_contrato: "generado",
    request_id: contractRequest.id,
    attempt_id: attempt.id,
    link_easylex: attempt.signing_url ?? undefined,
    expires_at: attempt.expires_at ?? undefined,
    expires_at_formatted: attempt.expires_at
      ? formatDateForDisplay(attempt.expires_at)
      : undefined,
  };

  await logBusinessResult(input, employee.id, result, correlationId);
  return result;
}

async function getEmployeeByRfc(rfc: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("employees")
    .select(
      "id, rfc, curp, nombre, apellidos, cp_csf, telefono, telefono_normalizado, email, empleador",
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

async function createIntegrationLog(input: {
  correlationId: string;
  requestPayload: JsonRecord;
  responsePayload: JsonRecord;
  success: boolean;
  entityType?: string;
  entityId?: string;
}) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("integration_logs").insert({
    provider: "whatsapp",
    direction: "inbound",
    endpoint: "/api/whatsapp/request-contract",
    method: "POST",
    request_payload: input.requestPayload,
    response_payload: input.responsePayload,
    status_code: 200,
    status: input.success ? "success" : "failed",
    success: input.success,
    correlation_id: input.correlationId,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
  });

  if (error) {
    throw error;
  }
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
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("audit_events").insert({
    event_name: input.eventName,
    entity_type: input.entityType,
    entity_id: input.entityId,
    employee_id: input.employeeId,
    source: input.source,
    summary: input.summary,
    metadata: input.metadata,
    actor_type: "system",
  });

  if (error) {
    throw error;
  }
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
  const digits = value?.replace(/\D/g, "") ?? "";

  if (!digits) {
    return null;
  }

  if (digits.length === 10) {
    return `52${digits}`;
  }

  if (digits.length === 12 && digits.startsWith("52")) {
    return digits;
  }

  return digits.length >= 10 && digits.length <= 15 ? digits : null;
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
