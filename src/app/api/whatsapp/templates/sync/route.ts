import { NextResponse } from "next/server";
import { syncTemplatesFromMeta } from "@/lib/whatsapp/templates";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

export async function POST() {
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
