import { NextResponse } from "next/server";
import {
  mockSignContract,
  parseMockSignPayload,
} from "@/lib/contracts/mock-sign";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const input = parseMockSignPayload(payload);
    const result = await mockSignContract(input);

    return NextResponse.json(result, {
      status: result.status === "not_found" ? 404 : 200,
    });
  } catch (error) {
    if (!isExpectedBadRequest(error)) {
      console.error(error);
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
