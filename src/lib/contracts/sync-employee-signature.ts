import { getSupabaseAdmin } from "@/lib/supabase/server";
import { EasyLexClient } from "@/lib/easylex/client";
import { mockSignContract } from "@/lib/contracts/mock-sign";

export type SyncEmployeeResult =
  | { status: "firmado"; message: string }
  | { status: "todavia_no"; message: string }
  | { status: "sin_contrato"; message: string }
  | { status: "ya_estaba"; message: string }
  | { status: "error"; message: string };

/**
 * "Comprobar si ya firmó" de UNA persona: le pregunta a EasyLex por su contrato
 * y, si allá ya está firmado, lo marca aquí — con la misma lógica que el webhook
 * (`mockSignContract`), así que el resultado es idéntico venga por donde venga.
 *
 * Existe porque la sincronización por ciclo no alcanza todos los casos: un
 * empleado dado de alta a mano no tiene lote, y entonces no habría NINGUNA forma
 * de reflejar su firma si el webhook de EasyLex falla. También sirve para el
 * caso suelto —alguien avisa "ya firmé" y el expediente no lo refleja— sin tener
 * que sincronizar el ciclo entero.
 *
 * Es idempotente: si ya estaba firmado, no vuelve a contarlo ni a notificar.
 */
export async function syncEmployeeSignature(employeeId: string): Promise<SyncEmployeeResult> {
  const supabase = getSupabaseAdmin();

  const { data: offer } = await supabase
    .from("advance_offers")
    .select("id")
    .eq("employee_id", employeeId)
    .eq("is_current", true)
    .maybeSingle();
  if (!offer) return { status: "sin_contrato", message: "Esta persona no tiene una oferta vigente." };

  const { data: request } = await supabase
    .from("contract_requests")
    .select("id, status")
    .eq("offer_id", offer.id)
    .maybeSingle();
  if (!request) return { status: "sin_contrato", message: "Todavía no se ha pedido el contrato de esta persona." };
  if (request.status === "firmado") {
    return { status: "ya_estaba", message: "Esta persona ya aparecía como firmada." };
  }

  // El intento más reciente que exista en EasyLex. Los mock (`mock_...`) no
  // están allá, así que no se pueden consultar.
  const { data: attempts } = await supabase
    .from("contract_attempts")
    .select("id, easylex_contract_id, status")
    .eq("contract_request_id", request.id)
    .not("easylex_contract_id", "is", null)
    .order("attempt_number", { ascending: false })
    .limit(1);

  const attempt = (attempts ?? [])[0];
  const documentId = (attempt?.easylex_contract_id as string | null) ?? "";
  if (!attempt || !documentId || documentId.startsWith("mock_")) {
    return { status: "sin_contrato", message: "Esta persona no tiene un contrato en EasyLex que consultar." };
  }

  const status = await new EasyLexClient().getDocumentStatus(documentId);
  if (!status.ok) {
    return { status: "error", message: "No se pudo consultar a EasyLex en este momento. Inténtalo de nuevo." };
  }
  if (status.status !== "SIGNED") {
    return { status: "todavia_no", message: "EasyLex dice que esta persona todavía no firma." };
  }

  const result = await mockSignContract({
    attemptId: attempt.id as string,
    easylexContractId: documentId,
    // eventId estable → si se comprueba dos veces, no se duplica el evento.
    eventId: `employee-sync-${attempt.id}`,
    signedAt: new Date().toISOString(),
    rawPayload: { source: "employee_sync", documentId, status: "SIGNED" },
  });

  if (result.status === "already_signed") {
    return { status: "ya_estaba", message: "Esta persona ya aparecía como firmada." };
  }
  if (result.status !== "signed") {
    return { status: "error", message: "EasyLex confirma la firma, pero no se pudo actualizar el expediente." };
  }
  return { status: "firmado", message: "¡Confirmado! Esta persona ya firmó y el expediente quedó actualizado." };
}
