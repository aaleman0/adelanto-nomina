import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/roles";
import { isUuid, invalidIdResponse } from "@/lib/api/validation";
import { applyImportBatch } from "@/lib/imports/apply";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireRole("operaciones");
  if (!auth.ok) return auth.response;

  const batchId = getBatchId(request.url);
  // Antes del cast a `uuid`: un batchId mal formado debe dar 400, no 500.
  if (!isUuid(batchId)) return invalidIdResponse("batchId");

  try {
    const result = await applyImportBatch(batchId);

    return NextResponse.json(result);
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo aplicar la importacion.",
      },
      { status: 500 },
    );
  }
}

function getBatchId(url: string): string {
  const segments = new URL(url).pathname.split("/").filter(Boolean);
  // La ruta es /api/imports/[batchId]/apply → el id es el penúltimo segmento.
  // Si faltara, devuelve "" y la validación de UUID lo rechaza con 400.
  return segments.at(-2) ?? "";
}
