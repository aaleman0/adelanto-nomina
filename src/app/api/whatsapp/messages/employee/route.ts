import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/roles";
import { isUuid, invalidIdResponse } from "@/lib/api/validation";
import { logger } from "@/lib/logger";
import { resumirRespuesta } from "@/lib/whatsapp/respuestas";

export const runtime = "nodejs";

export async function GET(request: Request) {
  // Historial de mensajes de un empleado (PII), alimenta el panel del expediente.
  // Se exige `solo_lectura` —el mismo nivel que puede abrir el expediente— para
  // que el panel no se rompa con 403 para quien consulta evidencia en modo enforce.
  const auth = await requireRole("solo_lectura");
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

    const [mensajes, entrantes] = await Promise.all([
      supabase
        .from("whatsapp_contract_messages")
        .select(
          "id, message_type, status, delivery_status, wa_message_id, bulk_send_id, clicked_at, created_at, delivered_at, read_at, error_message, retry_count, correlation_id, offer_id, contract_request_id",
        )
        .eq("employee_id", employeeId)
        .order("created_at", { ascending: false })
        .limit(50),
      // Lo que la persona contestó. Vive en integration_logs, donde el chatbot
      // deja cada mensaje entrante ligado a su empleado.
      supabase
        .from("integration_logs")
        .select("id, created_at, request_payload, response_payload")
        .eq("provider", "whatsapp")
        .eq("direction", "inbound")
        .eq("endpoint", "/api/webhooks/whatsapp")
        .eq("entity_id", employeeId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    if (mensajes.error) throw mensajes.error;

    // Si fallan solo las respuestas, lo enviado sigue siendo evidencia válida.
    // Se manda `null` y no una lista vacía: la pantalla no puede afirmar que la
    // persona no contestó cuando en realidad no se pudo leer.
    if (entrantes.error) {
      logger.error("whatsapp.messages.employee.respuestas_error", entrantes.error, { employeeId });
    }

    return NextResponse.json({
      ok: true,
      messages: mensajes.data ?? [],
      respuestas: entrantes.error ? null : (entrantes.data ?? []).map(resumirRespuesta),
    });
  } catch (err) {
    logger.error("whatsapp.messages.employee.error", err, { employeeId: searchParams.get("employeeId") });
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Error inesperado." },
      { status: 500 },
    );
  }
}
