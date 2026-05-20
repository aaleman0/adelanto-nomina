import { NextResponse } from "next/server";
import { getStoredTemplates } from "@/lib/whatsapp/templates";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

export async function GET() {
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
