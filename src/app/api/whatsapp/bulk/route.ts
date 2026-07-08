import { NextResponse } from "next/server";
import { sendBulkMessages, validateBulkEligibility } from "@/lib/whatsapp/bulk-send";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

// POST /api/whatsapp/bulk?action=send|validate
export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") ?? "send";

  try {
    const body = await request.json();
    const { mode, importId, employeeIds, templateName, buttonConfig } = body as {
      mode?: "import" | "manual";
      importId?: string;
      employeeIds?: string[];
      templateName?: string;
      buttonConfig?: {
        text: string;
        url: string;
      };
    };

    if (!mode || !["import", "manual"].includes(mode)) {
      return NextResponse.json({ ok: false, error: "mode es requerido (import | manual)." }, { status: 400 });
    }

    if (mode === "import" && !importId) {
      return NextResponse.json({ ok: false, error: "importId es requerido para mode=import." }, { status: 400 });
    }

    if (mode === "manual" && (!employeeIds || employeeIds.length === 0)) {
      return NextResponse.json({ ok: false, error: "employeeIds es requerido para mode=manual." }, { status: 400 });
    }

    if (action === "validate") {
      const result = await validateBulkEligibility({ mode, importId, employeeIds });
      return NextResponse.json({ ok: true, ...result });
    }

    // action === "send"
    const result = await sendBulkMessages({ mode, importId, employeeIds, templateName, buttonConfig });
    logger.info("whatsapp.bulk_send.completed", {
      bulkSendId: result.bulkSendId,
      mode,
      importId,
      total: result.total,
      sent: result.sent,
      failed: result.failed,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error("whatsapp.bulk_send.error", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Error inesperado." },
      { status: 500 },
    );
  }
}
