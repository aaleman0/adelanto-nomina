import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/roles";
import { isUuid, invalidIdResponse } from "@/lib/api/validation";
import { runBackofficeContractAction } from "@/lib/contracts/backoffice-actions";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    contractRequestId: string;
  }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const { contractRequestId } = await context.params;
  const auth = await requireRole("operaciones");
  if (!auth.ok) return auth.response;

  if (!isUuid(contractRequestId)) return invalidIdResponse("contractRequestId");


  try {
    const result = await runBackofficeContractAction({
      contractRequestId,
      action: "retry",
      actor: auth.actor,
    });

    return NextResponse.json(result, {
      status: result.status === "not_found" ? 404 : 200,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      {
        ok: false,
        status: "error",
        message: "No se pudo reintentar el flujo desde backoffice.",
      },
      { status: 500 },
    );
  }
}
