/**
 * TODO: Este endpoint es LEGACY. Migrar todos los clientes a /api/whatsapp/request-contract
 * y eliminar esta carpeta cuando WhatsApp esté 100% activo.
 * Fecha de creación: 2024-05
 * Target eliminación: 2024-Q3
 */
import { NextResponse } from "next/server";
import {
  parseRequestContractPayload,
  requestContractFromWhatsApp,
} from "@/lib/contracts/request-contract";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const input = parseRequestContractPayload(payload);
    // TODO: Eliminar este endpoint cuando no haya más clientes ManyChat
    const result = await requestContractFromWhatsApp(input);

    return NextResponse.json(result);
  } catch (error) {
    if (!isExpectedBadRequest(error)) {
      logger.error("manychat.legacy.request_contract", error);
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
