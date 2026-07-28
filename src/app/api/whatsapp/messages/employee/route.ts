import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/roles";
import { isUuid, invalidIdResponse } from "@/lib/api/validation";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

export async function GET(request: Request) {
  // Historial de mensajes de un empleado concreto (PII): exige operaciones.
  const auth = await requireRole("operaciones");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const employeeId = searchParams.get("employeeId");

  if (!employeeId) {
    return NextResponse.json({ ok: false, error: "employeeId es requerido." }, { status: 400 });
  }
  // Sin esto, un id mal formado revienta al castearse a `uuid` → 500 en vez de 400.
  if (!isUuid(employeeId)) return invalidIdResponse("employeeId");

  try {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("whatsapp_contract_messages")
      .select(
        "id, message_type, status, delivery_status, wa_message_id, bulk_send_id, clicked_at, created_at, delivered_at, read_at, error_message, retry_count, correlation_id, offer_id, contract_request_id",
      )
      .eq("employee_id", employeeId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    return NextResponse.json({ ok: true, messages: data ?? [] });
  } catch (err) {
    logger.error("whatsapp.messages.employee.error", err, { employeeId: searchParams.get("employeeId") });
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Error inesperado." },
      { status: 500 },
    );
  }
}
