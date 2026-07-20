import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/roles";
import { WhatsAppClient } from "@/lib/whatsapp/client";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireRole("admin");
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { access_token, phone_number_id } = body as {
      access_token?: string;
      phone_number_id?: string;
    };

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
