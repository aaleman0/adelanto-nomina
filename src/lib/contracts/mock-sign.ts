import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { recordAuditEvent, recordIntegrationLog } from "@/lib/audit";

type JsonRecord = Record<string, unknown>;

type MockSignPayload = {
  attempt_id?: unknown;
  attemptId?: unknown;
  easylex_contract_id?: unknown;
  easylexContractId?: unknown;
  event_id?: unknown;
  eventId?: unknown;
  signed_at?: unknown;
  signedAt?: unknown;
};

type MockSignInput = {
  attemptId: string | null;
  easylexContractId: string | null;
  eventId: string | null;
  signedAt: string;
  rawPayload: JsonRecord;
};

type ContractAttempt = {
  id: string;
  contract_request_id: string;
  easylex_contract_id: string | null;
  status: "generando" | "generado" | "expirado" | "firmado" | "error";
  signed_at: string | null;
};

type ContractRequest = {
  id: string;
  employee_id: string;
  offer_id: string;
  status: "recibida" | "generando" | "link_generado" | "firmado" | "error";
  signed_at: string | null;
};

export type MockSignResult = {
  ok: boolean;
  status: "signed" | "already_signed" | "not_found" | "invalid_request";
  message: string;
  contract_request_id?: string;
  attempt_id?: string;
  easylex_contract_id?: string | null;
  signed_at?: string;
};

export function parseMockSignPayload(payload: MockSignPayload): MockSignInput {
  const attemptId = readString(payload.attempt_id ?? payload.attemptId);
  const easylexContractId = readString(
    payload.easylex_contract_id ?? payload.easylexContractId,
  );
  const signedAt =
    readString(payload.signed_at ?? payload.signedAt) ??
    new Date().toISOString();

  if (!attemptId && !easylexContractId) {
    throw new Error("attempt_id o easylex_contract_id es requerido.");
  }

  return {
    attemptId,
    easylexContractId,
    eventId: readString(payload.event_id ?? payload.eventId),
    signedAt,
    rawPayload: payload as JsonRecord,
  };
}

export async function mockSignContract(
  input: MockSignInput,
): Promise<MockSignResult> {
  const correlationId = randomUUID();
  const attempt = await findContractAttempt(input);

  if (!attempt) {
    const result: MockSignResult = {
      ok: false,
      status: "not_found",
      message: "No se encontro el intento de contrato.",
    };
    await createIntegrationLog({
      correlationId,
      requestPayload: sanitizePayload(input.rawPayload),
      responsePayload: result,
      success: true,
      entityType: "contract_attempts",
    });
    return result;
  }

  const contractRequest = await getContractRequest(attempt.contract_request_id);

  if (!contractRequest) {
    const result: MockSignResult = {
      ok: false,
      status: "not_found",
      message: "No se encontro la solicitud de contrato.",
      attempt_id: attempt.id,
      easylex_contract_id: attempt.easylex_contract_id,
    };
    await createIntegrationLog({
      correlationId,
      requestPayload: sanitizePayload(input.rawPayload),
      responsePayload: result,
      success: true,
      entityType: "contract_attempts",
      entityId: attempt.id,
    });
    return result;
  }

  if (attempt.status === "firmado" && contractRequest.status === "firmado") {
    const result: MockSignResult = {
      ok: true,
      status: "already_signed",
      message: "El contrato ya estaba firmado.",
      contract_request_id: contractRequest.id,
      attempt_id: attempt.id,
      easylex_contract_id: attempt.easylex_contract_id,
      signed_at: attempt.signed_at ?? contractRequest.signed_at ?? input.signedAt,
    };
    await createIntegrationLog({
      correlationId,
      requestPayload: sanitizePayload(input.rawPayload),
      responsePayload: result,
      success: true,
      entityType: "contract_attempts",
      entityId: attempt.id,
    });
    return result;
  }

  await markSigned({
    attempt,
    contractRequest,
    signedAt: input.signedAt,
  });
  await createEasyLexEvent({
    input,
    attempt,
    contractRequest,
    correlationId,
  });
  await createAuditEvent({
    contractRequest,
    attempt,
    signedAt: input.signedAt,
    correlationId,
  });

  const result: MockSignResult = {
    ok: true,
    status: "signed",
    message: "Contrato firmado correctamente.",
    contract_request_id: contractRequest.id,
    attempt_id: attempt.id,
    easylex_contract_id: attempt.easylex_contract_id,
    signed_at: input.signedAt,
  };

  await createIntegrationLog({
    correlationId,
    requestPayload: sanitizePayload(input.rawPayload),
    responsePayload: result,
    success: true,
    entityType: "contract_attempts",
    entityId: attempt.id,
  });

  return result;
}

async function findContractAttempt(input: MockSignInput) {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("contract_attempts")
    .select("id, contract_request_id, easylex_contract_id, status, signed_at");

  query = input.attemptId
    ? query.eq("id", input.attemptId)
    : query.eq("easylex_contract_id", input.easylexContractId);

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw error;
  }

  return data as ContractAttempt | null;
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

async function markSigned(input: {
  attempt: ContractAttempt;
  contractRequest: ContractRequest;
  signedAt: string;
}) {
  const supabase = getSupabaseAdmin();
  const { error: attemptError } = await supabase
    .from("contract_attempts")
    .update({
      status: "firmado",
      signed_at: input.signedAt,
    })
    .eq("id", input.attempt.id);

  if (attemptError) {
    throw attemptError;
  }

  const { error: requestError } = await supabase
    .from("contract_requests")
    .update({
      status: "firmado",
      signed_at: input.signedAt,
    })
    .eq("id", input.contractRequest.id);

  if (requestError) {
    throw requestError;
  }

  const { error: offerError } = await supabase
    .from("advance_offers")
    .update({ status: "firmada" })
    .eq("id", input.contractRequest.offer_id);

  if (offerError) {
    throw offerError;
  }
}

async function createEasyLexEvent(input: {
  input: MockSignInput;
  attempt: ContractAttempt;
  contractRequest: ContractRequest;
  correlationId: string;
}) {
  const supabase = getSupabaseAdmin();
  const eventId =
    input.input.eventId ??
    `mock_sign_${input.attempt.easylex_contract_id ?? input.attempt.id}`;
  const { data: existingEvent, error: existingError } = await supabase
    .from("easylex_events")
    .select("id")
    .eq("event_id", eventId)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  if (existingEvent) {
    return;
  }

  const { error } = await supabase.from("easylex_events").insert({
    contract_request_id: input.contractRequest.id,
    contract_attempt_id: input.attempt.id,
    easylex_contract_id: input.attempt.easylex_contract_id,
    event_id: eventId,
    event_type: "contract.signed.mock",
    raw_payload: {
      ...sanitizePayload(input.input.rawPayload),
      correlation_id: input.correlationId,
    },
    status: "success",
    processed_at: input.input.signedAt,
  });

  if (error) {
    throw error;
  }
}

// Delegan en el módulo de auditoría compartido; se conserva la firma para no
// tocar los llamadores.
async function createAuditEvent(input: {
  contractRequest: ContractRequest;
  attempt: ContractAttempt;
  signedAt: string;
  correlationId: string;
}) {
  await recordAuditEvent({
    eventName: "contract.signed",
    entityType: "contract_requests",
    entityId: input.contractRequest.id,
    employeeId: input.contractRequest.employee_id,
    correlationId: input.correlationId,
    source: "easylex",
    previousState: input.contractRequest.status,
    newState: "firmado",
    summary: "Contrato firmado por webhook mock de EasyLex.",
    metadata: {
      contract_attempt_id: input.attempt.id,
      easylex_contract_id: input.attempt.easylex_contract_id,
      signed_at: input.signedAt,
    },
    actorType: "system",
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
  await recordIntegrationLog({
    provider: "easylex",
    direction: "inbound",
    endpoint: "/api/webhooks/easylex/mock-sign",
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

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function sanitizePayload(payload: JsonRecord) {
  return {
    attempt_id: payload.attempt_id ?? payload.attemptId ?? null,
    easylex_contract_id:
      payload.easylex_contract_id ?? payload.easylexContractId ?? null,
    event_id: payload.event_id ?? payload.eventId ?? null,
    source: "easylex_mock_sign",
  };
}
