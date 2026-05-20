import { NextResponse } from "next/server";
import { validateWhatsAppEnv } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

export async function GET() {
  // Supabase connectivity check
  let supabaseOk = false;
  let supabaseError: string | null = null;
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("settings")
      .select("key", { count: "exact", head: true })
      .limit(1);
    supabaseOk = !error;
    if (error) supabaseError = error.message;
  } catch (err) {
    supabaseError = err instanceof Error ? err.message : "Error inesperado";
    logger.warn("health.supabase.error", { error: supabaseError });
  }

  // WhatsApp env validation
  const waValidation = validateWhatsAppEnv();

  // Error rate check (últimas 24h)
  let errorRate: number | null = null;
  try {
    if (supabaseOk) {
      const supabase = getSupabaseAdmin();
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const [totalRes, failedRes] = await Promise.all([
        supabase
          .from("whatsapp_contract_messages")
          .select("id", { count: "exact", head: true })
          .gte("created_at", since24h),
        supabase
          .from("whatsapp_contract_messages")
          .select("id", { count: "exact", head: true })
          .eq("delivery_status", "failed")
          .gte("created_at", since24h),
      ]);

      const total = totalRes.count ?? 0;
      const failed = failedRes.count ?? 0;
      errorRate = total > 0 ? Math.round((failed / total) * 100) : 0;

      if (errorRate > 10) {
        logger.warn("health.whatsapp.high_error_rate", {
          errorRate,
          total,
          failed,
          threshold: 10,
        });
      }
    }
  } catch (err) {
    logger.warn("health.error_rate.error", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const whatsAppConfigured = waValidation.ok;
  const status = supabaseOk ? "ok" : "degraded";

  return NextResponse.json({
    ok: supabaseOk,
    status,
    timestamp: new Date().toISOString(),
    services: {
      supabase: {
        ok: supabaseOk,
        configured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
        error: supabaseError,
      },
      whatsapp: {
        ok: whatsAppConfigured,
        configured: whatsAppConfigured,
        errors: waValidation.ok ? [] : waValidation.errors,
        errorRate24h: errorRate,
        alerting: errorRate !== null && errorRate > 10,
      },
    },
  }, { status: supabaseOk ? 200 : 503 });
}
