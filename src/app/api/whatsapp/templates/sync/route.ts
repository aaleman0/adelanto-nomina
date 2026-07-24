import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/roles";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { RATE_LIMITS } from "@/lib/security/rate-limit-config";
import { syncTemplatesFromMeta } from "@/lib/whatsapp/templates";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, RATE_LIMITS.whatsappAdminAction);
  if (limited) return limited;

  const auth = await requireRole("admin");
  if (!auth.ok) return auth.response;

  try {
    const result = await syncTemplatesFromMeta();

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }

    logger.info("whatsapp.templates.synced", { count: result.synced });
    return NextResponse.json({ ok: true, synced: result.synced, templates: result.templates });
  } catch (err) {
    logger.error("whatsapp.templates.sync_error", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Error inesperado." },
      { status: 500 },
    );
  }
}
