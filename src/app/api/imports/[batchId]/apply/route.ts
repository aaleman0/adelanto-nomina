import { NextResponse } from "next/server";
import { applyImportBatch } from "@/lib/imports/apply";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const batchId = getBatchId(request.url);
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

function getBatchId(url: string) {
  const segments = new URL(url).pathname.split("/").filter(Boolean);
  const batchId = segments.at(-2);

  if (!batchId) {
    throw new Error("Batch ID requerido.");
  }

  return batchId;
}
