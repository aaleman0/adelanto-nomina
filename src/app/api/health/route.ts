import { NextResponse } from "next/server";
import { validateWhatsAppEnv, validateEasyLexEnv } from "@/lib/env";
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
    // El detalle va solo a los logs (la respuesta pública es booleana).
    if (error) {
      supabaseError = error.message;
      logger.warn("health.supabase.error", { error: supabaseError });
    }
  } catch (err) {
    supabaseError = err instanceof Error ? err.message : "Error inesperado";
    logger.warn("health.supabase.error", { error: supabaseError });
  }

  // WhatsApp env validation
  const waValidation = validateWhatsAppEnv();

  // EasyLex env validation. Además, un footgun de go-live: si en producción el
  // BASE_URL apunta a sandbox o está vacío, la firma no funciona con la cuenta
  // real. Se marca para que el health lo delate en vez de fallar en silencio.
  const easylexValidation = validateEasyLexEnv();
  const easylexBase = process.env.EASYLEX_BASE_URL ?? "";
  const easylexSandboxInProd =
    process.env.NODE_ENV === "production" &&
    (easylexBase === "" || easylexBase.includes("sandbox"));
  if (easylexSandboxInProd) {
    logger.warn("health.easylex.sandbox_in_prod", { base: easylexBase || "(vacío)" });
  }

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
    // Endpoint público: solo señales booleanas. El detalle (mensaje de error de
    // Supabase, env vars faltantes) queda en los logs, no en la respuesta, para
    // no exponer internals a cualquiera.
    services: {
      supabase: {
        ok: supabaseOk,
        configured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
      },
      whatsapp: {
        ok: whatsAppConfigured,
        configured: whatsAppConfigured,
        errorRate24h: errorRate,
        alerting: errorRate !== null && errorRate > 10,
      },
      easylex: {
        ok: easylexValidation.ok && !easylexSandboxInProd,
        configured: easylexValidation.ok,
        sandboxInProd: easylexSandboxInProd,
      },
    },
  }, { status: supabaseOk ? 200 : 503 });
}
