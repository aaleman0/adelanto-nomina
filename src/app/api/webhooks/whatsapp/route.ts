import { NextResponse } from "next/server";
import { verifyWebhook, handleWebhook } from "@/lib/whatsapp/webhooks";
import { logger } from "@/lib/logger";

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
  try {
    const payload = await request.json();
    logger.debug("whatsapp.webhook.received", { object: (payload as Record<string, unknown>)?.object });
    await handleWebhook(payload);
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("whatsapp.webhook.error", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
