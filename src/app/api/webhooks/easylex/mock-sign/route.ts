import { NextResponse } from "next/server";
import {
  mockSignContract,
  parseMockSignPayload,
} from "@/lib/contracts/mock-sign";
import { isProduction } from "@/lib/security/webhook-signatures";
import { logger } from "@/lib/logger";

import { enforceRateLimit } from "@/lib/security/rate-limit";
import { RATE_LIMITS } from "@/lib/security/rate-limit-config";

export const runtime = "nodejs";

/**
 * Webhook de firma simulada, solo para desarrollo y pruebas.
 *
 * No tiene autenticación: permite marcar cualquier contrato como firmado. Por
 * eso está deshabilitado por defecto y responde 404 (no 403, para no revelar
 * que existe). Doble cerrojo, para no depender de un único `NODE_ENV`:
 *   1. Debe estar activado explícitamente con ENABLE_MOCK_SIGN="true".
 *   2. Nunca en producción, aunque el flag esté activo.
 * Así, un despliegue con NODE_ENV mal fijado NO reabre el endpoint por sí solo.
 */
export async function POST(request: Request) {
  const mockSignEnabled = process.env.ENABLE_MOCK_SIGN === "true" && !isProduction();
  if (!mockSignEnabled) {
    return new Response(null, { status: 404 });
  }

  const limited = enforceRateLimit(request, RATE_LIMITS.webhookEasylex);
  if (limited) return limited;

  try {
    const payload = await request.json();
    const input = parseMockSignPayload(payload);
    const result = await mockSignContract(input);

    return NextResponse.json(result, {
      status: result.status === "not_found" ? 404 : 200,
    });
  } catch (error) {
    if (!isExpectedBadRequest(error)) {
      logger.error("easylex.mock_sign.error", error);
    }

    return NextResponse.json(
      {
        ok: false,
        status: "invalid_request",
        message:
          error instanceof Error
            ? error.message
            : "No se pudo procesar el webhook mock.",
      },
      { status: 400 },
    );
  }
}

function isExpectedBadRequest(error: unknown) {
  return (
    error instanceof Error &&
    error.message === "attempt_id o easylex_contract_id es requerido."
  );
}
