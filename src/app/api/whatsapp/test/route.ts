import { NextResponse } from "next/server";
import { WhatsAppClient } from "@/lib/whatsapp/client";

export const runtime = "nodejs";

export async function POST(request: Request) {
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
    console.error("[whatsapp/test]", err);
    return NextResponse.json({ ok: false, error: "Error inesperado." }, { status: 500 });
  }
}
