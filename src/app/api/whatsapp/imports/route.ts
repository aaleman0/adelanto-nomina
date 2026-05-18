import { NextResponse } from "next/server";
import { getRecentImports, getEmployeesFromImport } from "@/lib/whatsapp/imports";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const importId = searchParams.get("importId");

  try {
    if (importId) {
      const employees = await getEmployeesFromImport(importId);
      return NextResponse.json({ ok: true, employees });
    }

    const imports = await getRecentImports();
    return NextResponse.json({ ok: true, imports });
  } catch (err) {
    logger.error("whatsapp.imports.error", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Error inesperado." },
      { status: 500 },
    );
  }
}
