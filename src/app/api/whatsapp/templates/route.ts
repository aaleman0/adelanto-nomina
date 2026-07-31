import { NextResponse } from "next/server";
import { getStoredTemplates } from "@/lib/whatsapp/templates";
import { requireRole } from "@/lib/auth/roles";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireRole("solo_lectura");
  if (!auth.ok) return auth.response;

  try {
    const templates = await getStoredTemplates();
    return NextResponse.json({ ok: true, templates });
  } catch (err) {
    logger.error("whatsapp.templates.get_error", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Error inesperado." },
      { status: 500 },
    );
  }
}
