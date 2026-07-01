import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { easylexEnv } from "@/lib/env";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";

type EasyLexWebhookPayload = {
  webhookId?: string;
  url?: string;
  eventType?: string;
  createdAt?: string;
  trigger?: string;
  data?: {
    id?: string;
    documentId?: string;
    firstName?: string;
    lastName?: string;
    motherLastName?: string;
    email?: string;
    hasSigned?: boolean;
    signedAt?: string;
    name?: string;
    status?: string;
    signatories?: Array<{
      id?: string;
      hasSigned?: boolean;
      signedAt?: string;
    }>;
  };
};

export async function POST(request: Request) {
  const correlationId = randomUUID();

  try {
    const signature = request.headers.get("x-easylex-signature");
    const webhookSecret = easylexEnv.webhookSecret;

    if (webhookSecret && signature !== webhookSecret) {
      logger.warn("easylex.webhook.unauthorized", {
        correlationId,
        hasSignature: Boolean(signature),
      });
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const payload: EasyLexWebhookPayload = await request.json();

    logger.info("easylex.webhook.received", {
      webhookId: payload.webhookId,
      eventType: payload.eventType,
      correlationId,
    });

    const eventType = payload.eventType;

    if (eventType === "SIGNED_BY_USER") {
      await handleSignedByUser(payload, correlationId);
    } else if (eventType === "DOCUMENT_SIGNED") {
      await handleDocumentSigned(payload, correlationId);
    } else {
      logger.warn("easylex.webhook.unknown_event", {
        eventType,
        correlationId,
      });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    logger.error("easylex.webhook.error", error, { correlationId });

    return NextResponse.json({ ok: true }, { status: 200 });
  }
}

async function handleSignedByUser(
  payload: EasyLexWebhookPayload,
  correlationId: string,
) {
  const data = payload.data;
  if (!data) return;

  const documentId = data.documentId;

  if (!documentId) {
    logger.warn("easylex.webhook.signed_by_user.missing_document_id", {
      correlationId,
      payload,
    });
    return;
  }

  const supabase = getSupabaseAdmin();

  const { data: attempt, error: attemptError } = await supabase
    .from("contract_attempts")
    .select("id, contract_request_id, easylex_contract_id, status, signed_at")
    .eq("easylex_contract_id", documentId)
    .maybeSingle();

  if (attemptError) throw attemptError;

  if (!attempt) {
    logger.warn("easylex.webhook.signed_by_user.attempt_not_found", {
      documentId,
      correlationId,
    });
    return;
  }

  if (attempt.status === "firmado") {
    logger.info("easylex.webhook.signed_by_user.already_signed", {
      attemptId: attempt.id,
      documentId,
      correlationId,
    });
    return;
  }

  await recordEasyLexEvent({
    payload,
    attempt,
    correlationId,
    eventType: "signed_by_user",
  });

  logger.info("easylex.webhook.signed_by_user.recorded", {
    attemptId: attempt.id,
    documentId,
    correlationId,
  });
}

async function handleDocumentSigned(
  payload: EasyLexWebhookPayload,
  correlationId: string,
) {
  const data = payload.data;
  if (!data) return;

  const documentId = data.id;
  const signedAt =
    data.signatories?.[0]?.signedAt ?? new Date().toISOString();

  if (!documentId) {
    logger.warn("easylex.webhook.document_signed.missing_document_id", {
      correlationId,
      payload,
    });
    return;
  }

  const supabase = getSupabaseAdmin();

  const { data: attempt, error: attemptError } = await supabase
    .from("contract_attempts")
    .select("id, contract_request_id, easylex_contract_id, status, signed_at")
    .eq("easylex_contract_id", documentId)
    .maybeSingle();

  if (attemptError) throw attemptError;

  if (!attempt) {
    logger.warn("easylex.webhook.document_signed.attempt_not_found", {
      documentId,
      correlationId,
    });
    return;
  }

  if (attempt.status === "firmado") {
    logger.info("easylex.webhook.document_signed.already_signed", {
      attemptId: attempt.id,
      documentId,
      correlationId,
    });
    return;
  }

  const { error: updateAttemptError } = await supabase
    .from("contract_attempts")
    .update({ status: "firmado", signed_at: signedAt })
    .eq("id", attempt.id);

  if (updateAttemptError) throw updateAttemptError;

  const { data: contractRequest, error: crError } = await supabase
    .from("contract_requests")
    .select("id, employee_id, offer_id, status, signed_at")
    .eq("id", attempt.contract_request_id)
    .maybeSingle();

  if (crError) throw crError;

  if (contractRequest) {
    const { error: updateCrError } = await supabase
      .from("contract_requests")
      .update({ status: "firmado", signed_at: signedAt })
      .eq("id", contractRequest.id);

    if (updateCrError) throw updateCrError;

    const { error: offerError } = await supabase
      .from("advance_offers")
      .update({ status: "firmada" })
      .eq("id", contractRequest.offer_id);

    if (offerError) throw offerError;

    await supabase.from("audit_events").insert({
      event_name: "contract.signed",
      entity_type: "contract_requests",
      entity_id: contractRequest.id,
      employee_id: contractRequest.employee_id,
      correlation_id: correlationId,
      source: "easylex",
      previous_state: contractRequest.status,
      new_state: "firmado",
      summary: "Contrato firmado confirmado por webhook de EasyLex.",
      metadata: {
        contract_attempt_id: attempt.id,
        easylex_contract_id: documentId,
        signed_at: signedAt,
        webhook_id: payload.webhookId,
      },
      actor_type: "system",
    });
  }

  await recordEasyLexEvent({
    payload,
    attempt,
    correlationId,
    eventType: "document_signed",
  });

  await supabase.from("integration_logs").insert({
    provider: "easylex",
    direction: "inbound",
    endpoint: "/api/webhooks/easylex/sign",
    method: "POST",
    request_payload: payload,
    response_payload: { ok: true, status: "signed" },
    status_code: 200,
    status: "success",
    success: true,
    correlation_id: correlationId,
    entity_type: "contract_attempts",
    entity_id: attempt.id,
  });

  logger.info("easylex.webhook.document_signed.completed", {
    attemptId: attempt.id,
    contractRequestId: attempt.contract_request_id,
    documentId,
    signedAt,
    correlationId,
  });
}

async function recordEasyLexEvent(input: {
  payload: EasyLexWebhookPayload;
  attempt: { id: string; contract_request_id: string; easylex_contract_id: string | null };
  correlationId: string;
  eventType: string;
}) {
  const supabase = getSupabaseAdmin();
  const eventId = input.payload.webhookId ?? `webhook_${input.attempt.id}_${Date.now()}`;

  const { data: existing } = await supabase
    .from("easylex_events")
    .select("id")
    .eq("event_id", eventId)
    .maybeSingle();

  if (existing) return;

  await supabase.from("easylex_events").insert({
    contract_request_id: input.attempt.contract_request_id,
    contract_attempt_id: input.attempt.id,
    easylex_contract_id: input.attempt.easylex_contract_id,
    event_id: eventId,
    event_type: input.eventType,
    raw_payload: input.payload,
    status: "success",
    processed_at: new Date().toISOString(),
  });
}
