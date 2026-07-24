import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { validateWhatsAppEnv } from "@/lib/env";
import { WhatsAppConfigBodySchema } from "@/lib/whatsapp/schemas";
import { parseJsonBody } from "@/lib/api/validation";
import { requireRole } from "@/lib/auth/roles";

export const runtime = "nodejs";

export async function GET() {
  // La respuesta incluye el webhook verify token: solo admin, igual que el POST.
  const auth = await requireRole("admin");
  if (!auth.ok) return auth.response;

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

/**
 * Guarda la configuración no sensible de WhatsApp.
 *
 * El access token y el app secret **ya no se aceptan por aquí**. Antes se
 * guardaban en texto plano en la tabla `settings`, legibles por cualquier
 * sesión autenticada, y además las variables de entorno tienen precedencia, así
 * que el valor guardado a menudo ni siquiera se usaba.
 *
 * Ambos secretos van en variables de entorno o en un gestor de secretos. Si
 * llegan en el cuerpo se ignoran de forma explícita y se avisa al llamador.
 */
export async function POST(request: Request) {
  const auth = await requireRole("admin");
  if (!auth.ok) return auth.response;

  const parsed = await parseJsonBody(request, WhatsAppConfigBodySchema);
  if (!parsed.success) return parsed.response;

  const {
    access_token,
    phone_number_id,
    business_number,
    webhook_verify_token,
    app_secret,
  } = parsed.data;

  const ignoredSecrets: string[] = [];
  if (access_token) ignoredSecrets.push("access_token");
  if (app_secret) ignoredSecrets.push("app_secret");

  if (ignoredSecrets.length > 0) {
    logger.warn("whatsapp.config.secret_rejected", {
      fields: ignoredSecrets,
      userId: auth.actor.userId,
      detail: "Los secretos solo se configuran por variables de entorno.",
    });
  }

  try {
    const supabase = getSupabaseAdmin();

    const upsertRows = [
      { key: "whatsapp_phone_number_id", value: phone_number_id ?? "" },
      { key: "whatsapp_business_number", value: business_number ?? "" },
      { key: "whatsapp_webhook_verify_token", value: webhook_verify_token ?? "" },
    ];

    const { error } = await supabase
      .from("settings")
      .upsert(upsertRows, { onConflict: "key" });

    if (error) throw error;

    logger.info("whatsapp.config.saved", { userId: auth.actor.userId });

    return NextResponse.json({
      ok: true,
      ignoredSecrets,
      ...(ignoredSecrets.length > 0
        ? {
            warning:
              "El access token y el app secret no se guardan en base de datos. " +
              "Configúralos con WHATSAPP_ACCESS_TOKEN y WHATSAPP_APP_SECRET.",
          }
        : {}),
    });
  } catch (err) {
    logger.error("whatsapp.config.save_error", err);
    return NextResponse.json({ ok: false, error: "Error al guardar configuración." }, { status: 500 });
  }
}
