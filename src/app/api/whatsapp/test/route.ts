import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/roles";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { RATE_LIMITS } from "@/lib/security/rate-limit-config";
import { parseJsonBody } from "@/lib/api/validation";
import { WhatsAppTestBodySchema } from "@/lib/whatsapp/schemas";
import { WhatsAppClient } from "@/lib/whatsapp/client";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, RATE_LIMITS.whatsappAdminAction);
  if (limited) return limited;

  const auth = await requireRole("admin");
  if (!auth.ok) return auth.response;

  const parsed = await parseJsonBody(request, WhatsAppTestBodySchema);
  if (!parsed.success) return parsed.response;
  const { access_token, phone_number_id } = parsed.data;

  try {
    const client = new WhatsAppClient(access_token, phone_number_id);
    const result = await client.testConnection();

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      phoneNumber: result.phoneNumber,
      displayName: result.displayName,
    });
  } catch (err) {
    logger.error("whatsapp.test_connection.error", err);
    return NextResponse.json({ ok: false, error: "Error inesperado." }, { status: 500 });
  }
}
