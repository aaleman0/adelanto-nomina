import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/roles";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { RATE_LIMITS } from "@/lib/security/rate-limit-config";
import { isUuid, invalidIdResponse } from "@/lib/api/validation";
import { runBackofficeContractAction } from "@/lib/contracts/backoffice-actions";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    contractRequestId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const limited = enforceRateLimit(request, RATE_LIMITS.backofficeAction);
  if (limited) return limited;

  const { contractRequestId } = await context.params;
  const auth = await requireRole("operaciones");
  if (!auth.ok) return auth.response;

  if (!isUuid(contractRequestId)) return invalidIdResponse("contractRequestId");


  try {
    const result = await runBackofficeContractAction({
      contractRequestId,
      action: "regenerate_expired",
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
        message: "No se pudo regenerar el link desde backoffice.",
      },
      { status: 500 },
    );
  }
}
