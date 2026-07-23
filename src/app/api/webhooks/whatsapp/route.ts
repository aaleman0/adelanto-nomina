import { NextResponse } from "next/server";
import { verifyWebhook, handleWebhook } from "@/lib/whatsapp/webhooks";
import { verifyMetaSignature, isProduction, enforceSignatures } from "@/lib/security/webhook-signatures";
import { whatsAppEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

import { enforceRateLimit } from "@/lib/security/rate-limit";
import { RATE_LIMITS } from "@/lib/security/rate-limit-config";

export const runtime = "nodejs";

// GET - Verificación de webhook por Meta
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode") ?? "";
  const token = searchParams.get("hub.verify_token") ?? "";
  const challenge = searchParams.get("hub.challenge") ?? "";

  const result = verifyWebhook(mode, token, challenge);
  if (result !== null) {
    return new Response(result, { status: 200 });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

// POST - Recibir eventos de Meta
export async function POST(request: Request) {
  const limited = enforceRateLimit(request, RATE_LIMITS.webhookWhatsapp);
  if (limited) return limited;

  // El cuerpo se lee como texto crudo: la firma HMAC de Meta se calcula sobre
  // los bytes exactos. Parsear antes rompería la verificación.
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  const appSecret = whatsAppEnv.appSecret;

  if (!appSecret) {
    // Sin secreto no hay forma de verificar el origen. En producción (o con
    // WEBHOOK_ENFORCE_SIGNATURES=true) se rechaza (fail closed); en desarrollo se
    // permite para poder usar túneles y payloads simulados, pero se deja
    // constancia.
    if (isProduction() || enforceSignatures()) {
      logger.error("whatsapp.webhook.app_secret_missing", null, {
        detail: "WHATSAPP_APP_SECRET no configurado: se rechaza el webhook.",
      });
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    logger.warn("whatsapp.webhook.signature_check_skipped", {
      detail: "WHATSAPP_APP_SECRET no configurado (solo permitido fuera de producción).",
    });
  } else if (!verifyMetaSignature(rawBody, signature, appSecret)) {
    logger.warn("whatsapp.webhook.invalid_signature", {
      hasSignature: Boolean(signature),
    });
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = JSON.parse(rawBody);
    logger.debug("whatsapp.webhook.received", {
      object: (payload as Record<string, unknown>)?.object,
    });
    await handleWebhook(payload);
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("whatsapp.webhook.error", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
