import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getWhatsAppClient } from "@/lib/whatsapp/client";
import { logger } from "@/lib/logger";
import { whatsAppEnv } from "@/lib/env";

export const runtime = "nodejs";

// Verificación REAL del token contra Meta (no solo su presencia), cacheada para
// no golpear la API de Meta en cada poll del banner de salud. El token temporal
// caduca sin aviso: esto lo detecta de forma proactiva.
const CONNECTION_TTL_MS = 5 * 60 * 1000;
let connectionCache: { at: number; ok: boolean; error: string | null } | null = null;

async function checkWhatsappConnection(canTest: boolean): Promise<{ ok: boolean; error: string | null }> {
  // `canTest` = hay token + phone number (lo único que testConnection necesita).
  // NO se exige appSecret aquí: ese solo hace falta para verificar la firma del
  // webhook, no para enviar; gatearlo aquí reportaría "no configurado" en vez
  // del estado real del token.
  if (!canTest) return { ok: false, error: "WhatsApp sin token o phone number configurado." };
  const now = Date.now();
  if (connectionCache && now - connectionCache.at < CONNECTION_TTL_MS) {
    return { ok: connectionCache.ok, error: connectionCache.error };
  }
  const result = await getWhatsAppClient().testConnection();
  connectionCache = { at: now, ok: result.ok, error: result.ok ? null : result.error ?? "Error de conexión con Meta." };
  return { ok: connectionCache.ok, error: connectionCache.error };
}

export async function GET() {
  const checks = {
    supabase: false,
    env: {
      accessToken: Boolean(whatsAppEnv.accessToken),
      phoneNumberId: Boolean(whatsAppEnv.phoneNumberId),
      businessAccountId: Boolean(whatsAppEnv.businessAccountId),
      webhookVerifyToken: Boolean(whatsAppEnv.webhookVerifyToken),
      appSecret: Boolean(whatsAppEnv.appSecret),
    },
    tables: {
      whatsapp_contacts: false,
      whatsapp_contract_messages: false,
      whatsapp_bulk_sends: false,
      whatsapp_templates: false,
    },
  };

  let status = 200;
  const errors: string[] = [];

  // Check Supabase connection
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("whatsapp_contacts").select("id").limit(1);
    if (!error) {
      checks.supabase = true;
    } else {
      errors.push(`Supabase error: ${error.message}`);
      status = 503;
    }
  } catch (err) {
    errors.push(`Supabase connection failed: ${err instanceof Error ? err.message : String(err)}`);
    status = 503;
  }

  // Check environment variables
  const missingEnv = Object.entries(checks.env)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missingEnv.length > 0) {
    errors.push(`Missing env vars: ${missingEnv.join(", ")}`);
    // Don't fail health check for missing env - WhatsApp might not be configured yet
  }

  // Check tables exist
  if (checks.supabase) {
    try {
      const supabase = getSupabaseAdmin();
      
      const tableChecks = [
        { name: "whatsapp_contacts", check: "whatsapp_contacts" },
        { name: "whatsapp_contract_messages", check: "whatsapp_contract_messages" },
        { name: "whatsapp_bulk_sends", check: "whatsapp_bulk_sends" },
        { name: "whatsapp_templates", check: "whatsapp_templates" },
      ];

      for (const table of tableChecks) {
        try {
          const { error } = await supabase.from(table.check).select("count").limit(1);
          if (!error) {
            checks.tables[table.name as keyof typeof checks.tables] = true;
          } else {
            errors.push(`Table ${table.name} error: ${error.message}`);
          }
        } catch {
          errors.push(`Table ${table.name} check failed`);
        }
      }
    } catch {
      errors.push("Table checks failed");
    }
  }

  // Log health check results
  const allTablesOk = Object.values(checks.tables).every(Boolean);
  const isConfigured = Object.values(checks.env).every(Boolean);

  // Validez real del token contra Meta (cacheada). No baja el status HTTP —el
  // servicio sigue "healthy" aunque el token expire— pero alimenta el banner.
  // Se prueba con token + phone number, sin exigir appSecret (ese es solo para
  // el webhook), para reportar el estado REAL del token aunque falte esa var.
  const canTestConnection = Boolean(whatsAppEnv.accessToken) && Boolean(whatsAppEnv.phoneNumberId);
  const connection = await checkWhatsappConnection(canTestConnection);

  logger.info("whatsapp.health_check", {
    status,
    supabase: checks.supabase,
    tables: allTablesOk,
    env: isConfigured,
    connection: connection.ok,
    // El detalle del error de conexión (mensaje crudo de Meta) se queda en el
    // log interno; la respuesta pública solo lleva el booleano.
    connectionError: connection.ok ? undefined : connection.error ?? undefined,
    errors: errors.length > 0 ? errors : undefined,
  });

  // La respuesta pública no incluye `errors`: llevaban `error.message` crudo de
  // Supabase, que expone internals. El detalle queda en el log de arriba; la
  // respuesta se queda con los booleanos de `checks`.
  return NextResponse.json(
    {
      ok: status === 200 && checks.supabase && allTablesOk,
      status: status === 200 ? "healthy" : "unhealthy",
      checks,
      whatsappConfigured: isConfigured,
      // Solo el booleano: el mensaje crudo de Meta (que puede exponer internals)
      // queda en el log, no en la respuesta pública.
      connection: { ok: connection.ok },
    },
    { status }
  );
}
