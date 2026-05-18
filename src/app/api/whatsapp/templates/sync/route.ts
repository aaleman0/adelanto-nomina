import { NextResponse } from "next/server";
import { syncTemplatesFromMeta } from "@/lib/whatsapp/templates";

export const runtime = "nodejs";

export async function POST() {
  try {
    const result = await syncTemplatesFromMeta();

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ ok: true, synced: result.synced, templates: result.templates });
  } catch (err) {
    console.error("[whatsapp/templates/sync]", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Error inesperado." },
      { status: 500 },
    );
  }
}
