import { NextResponse } from "next/server";
import { sendBulkMessages, enqueueBulkSend, validateBulkEligibility } from "@/lib/whatsapp/bulk-send";
import { getQueueDriver } from "@/lib/queue";
import { requireRole } from "@/lib/auth/roles";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { RATE_LIMITS } from "@/lib/security/rate-limit-config";
import { BulkSendBodySchema, BulkSendActionSchema } from "@/lib/whatsapp/schemas";
import { parseJsonBody, parseQuery } from "@/lib/api/validation";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

// POST /api/whatsapp/bulk?action=send|validate
export async function POST(request: Request) {
  const query = parseQuery(request, BulkSendActionSchema);
  if (!query.success) return query.response;
  const { action } = query.data;

  // Solo el envío se limita: validar es una consulta barata sin efectos hacia
  // Meta, y un operador la ejecuta a menudo mientras ajusta la selección.
  if (action === "send") {
    const limited = enforceRateLimit(request, RATE_LIMITS.whatsappBulkSend);
    if (limited) return limited;
  }

  // Validar elegibilidad es una consulta sin efectos; enviar no lo es.
  const auth = await requireRole(action === "validate" ? "solo_lectura" : "operaciones");
  if (!auth.ok) return auth.response;

  const parsed = await parseJsonBody(request, BulkSendBodySchema);
  if (!parsed.success) return parsed.response;
  const { mode, importId, employeeIds, status, templateName, buttonUrl } = parsed.data;

  try {
    if (action === "validate") {
      const result = await validateBulkEligibility({ mode, importId, employeeIds, status });
      return NextResponse.json({ ok: true, ...result });
    }

    const driver = getQueueDriver();

    // Con cola configurada el envío es asíncrono: se responde en cuanto las
    // tareas están encoladas. Sin ella se mantiene el envío dentro del request,
    // que es el comportamiento histórico.
    const result =
      driver.kind === "inline"
        ? await sendBulkMessages({ mode, importId, employeeIds, status, templateName, buttonUrl })
        : await enqueueBulkSend({ mode, importId, employeeIds, status, templateName, buttonUrl }, driver);

    logger.info("whatsapp.bulk_send.dispatched", {
      bulkSendId: result.bulkSendId,
      transport: driver.kind,
      mode,
      importId,
      total: result.total,
      eligible: result.eligible,
      sent: result.sent,
      failed: result.failed,
      queued: result.queued,
      status: result.status,
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
