import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/roles";
import { runBatchBackofficeAction } from "@/lib/contracts/backoffice-actions";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { RATE_LIMITS } from "@/lib/security/rate-limit-config";
import { parseJsonBody } from "@/lib/api/validation";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

// Estados de desvío sobre los que tiene sentido una acción en lote: links
// vencidos (regenerar) y errores (reintentar). Se acota aquí para no permitir
// disparar acciones masivas sobre estados donde no aplica.
const BatchBodySchema = z.object({
  status: z.enum(["link_expirado", "error"]),
});

export async function POST(request: Request) {
  // Acción de alta consecuencia (llama a EasyLex por cada expediente): mismo
  // rate limit que el envío masivo.
  const limited = enforceRateLimit(request, RATE_LIMITS.whatsappBulkSend);
  if (limited) return limited;

  const auth = await requireRole("operaciones");
  if (!auth.ok) return auth.response;

  const parsed = await parseJsonBody(request, BatchBodySchema);
  if (!parsed.success) return parsed.response;

  try {
    const summary = await runBatchBackofficeAction({
      status: parsed.data.status,
      actor: auth.actor,
    });

    logger.info("backoffice.batch_action.done", {
      status: summary.status,
      action: summary.action,
      processed: summary.processed,
      succeeded: summary.succeeded,
      failed: summary.failed,
      remaining: summary.remaining,
      userId: auth.actor.userId,
    });

    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    logger.error("backoffice.batch_action.error", error, { status: parsed.data.status });
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Error inesperado." },
      { status: 500 },
    );
  }
}
