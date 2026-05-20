import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { validateWhatsAppEnv } from "@/lib/env";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("settings")
      .select("key, value")
      .in("key", [
        "whatsapp_phone_number_id",
        "whatsapp_business_number",
        "whatsapp_webhook_verify_token",
      ]);

    if (error) throw error;

    const config: Record<string, string> = {};
    for (const row of data ?? []) {
      config[row.key] = row.value;
    }

    // Incluir estado de validación de env vars
    const envValidation = validateWhatsAppEnv();
    return NextResponse.json({
      ok: true,
      config,
      envValid: envValidation.ok,
      envErrors: envValidation.ok ? [] : envValidation.errors,
    });
  } catch (err) {
    logger.error("whatsapp.config.get_error", err);
    return NextResponse.json({ ok: false, error: "Error al obtener configuración." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      access_token,
      phone_number_id,
      business_number,
      webhook_verify_token,
      app_secret,
    } = body as Record<string, string>;

    const supabase = getSupabaseAdmin();

    const upsertRows = [
      { key: "whatsapp_phone_number_id", value: phone_number_id ?? "" },
      { key: "whatsapp_business_number", value: business_number ?? "" },
      { key: "whatsapp_webhook_verify_token", value: webhook_verify_token ?? "" },
    ];

    if (access_token) {
      upsertRows.push({ key: "whatsapp_access_token", value: access_token });
    }
    if (app_secret) {
      upsertRows.push({ key: "whatsapp_app_secret", value: app_secret });
    }

    const { error } = await supabase
      .from("settings")
      .upsert(upsertRows, { onConflict: "key" });

    if (error) throw error;

    logger.info("whatsapp.config.saved");
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("whatsapp.config.save_error", err);
    return NextResponse.json({ ok: false, error: "Error al guardar configuración." }, { status: 500 });
  }
}
