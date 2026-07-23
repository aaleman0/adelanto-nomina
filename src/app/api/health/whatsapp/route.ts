import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { whatsAppEnv } from "@/lib/env";

export const runtime = "nodejs";

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
  
  logger.info("whatsapp.health_check", {
    status,
    supabase: checks.supabase,
    tables: allTablesOk,
    env: isConfigured,
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
    },
    { status }
  );
}
