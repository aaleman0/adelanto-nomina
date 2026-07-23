import { NextResponse } from "next/server";
import {
  parseRequestContractPayload,
  requestContractFromWhatsApp,
} from "@/lib/contracts/request-contract";
import { requireRole } from "@/lib/auth/roles";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { RATE_LIMITS } from "@/lib/security/rate-limit-config";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

export async function POST(request: Request) {
  // Genera contrato + documento en EasyLex + envío por WhatsApp: escritura cara
  // con efectos externos. Se protege con rate limit y rol mínimo `operaciones`
  // (era el único endpoint de escritura de sesión sin guard).
  const limited = enforceRateLimit(request, RATE_LIMITS.contractRequest);
  if (limited) return limited;

  const auth = await requireRole("operaciones");
  if (!auth.ok) return auth.response;

  try {
    const payload = await request.json();
    const input = parseRequestContractPayload(payload);
    const result = await requestContractFromWhatsApp(input);

    return NextResponse.json(result);
  } catch (error) {
    if (!isExpectedBadRequest(error)) {
      logger.error("whatsapp.request_contract.error", error);
    }

    return NextResponse.json(
      {
        ok: false,
        status: "invalid_request",
        message:
          error instanceof Error
            ? error.message
            : "No se pudo procesar la solicitud.",
        estatus_contrato: "no_disponible",
      },
      { status: 400 },
    );
  }
}

function isExpectedBadRequest(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return [
    "subscriber_id es requerido.",
    "RFC es requerido.",
  ].includes(error.message);
}
