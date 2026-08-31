import { getSupabaseAdmin } from "@/lib/supabase/server";
import { EasyLexClient } from "@/lib/easylex/client";
import { mockSignContract } from "@/lib/contracts/mock-sign";

export type SyncBatchResult = {
  checked: number;
  newlySigned: number;
  errors: number;
};

/**
 * "Actualizar estados" de un ciclo: consulta EasyLex por cada contrato GENERADO
 * y NO firmado del lote, y si ya está firmado allá, lo marca aquí — reutilizando
 * exactamente la misma lógica del webhook vía `mockSignContract`.
 *
 * Es la alternativa manual al webhook de EasyLex mientras no hay deploy: el
 * operador la dispara y el sistema se entera de quién firmó. Idempotente: los ya
 * firmados no se recuentan (mockSignContract devuelve `already_signed`).
 */
export async function syncBatchSignatures(batchId: string): Promise<SyncBatchResult> {
  const supabase = getSupabaseAdmin();

  const { data: offers, error: offErr } = await supabase
    .from("advance_offers")
    .select("id")
    .eq("source_batch_id", batchId);
  if (offErr) throw offErr;
  const offerIds = (offers ?? []).map((o) => o.id as string);
  if (offerIds.length === 0) return { checked: 0, newlySigned: 0, errors: 0 };

  const { data: requests, error: reqErr } = await supabase
    .from("contract_requests")
    .select("id")
    .in("offer_id", offerIds)
    .neq("status", "firmado");
  if (reqErr) throw reqErr;
  const requestIds = (requests ?? []).map((r) => r.id as string);
  if (requestIds.length === 0) return { checked: 0, newlySigned: 0, errors: 0 };

  const { data: attempts, error: attErr } = await supabase
    .from("contract_attempts")
    .select("id, easylex_contract_id, status")
    .in("contract_request_id", requestIds)
    .not("easylex_contract_id", "is", null)
    .neq("status", "firmado");
  if (attErr) throw attErr;

  const client = new EasyLexClient();
  let checked = 0;
  let newlySigned = 0;
  let errors = 0;

  for (const attempt of attempts ?? []) {
    const documentId = (attempt.easylex_contract_id as string | null) ?? "";
    // Los intentos mock (`mock_...`) no existen en EasyLex: se saltan.
    if (!documentId || documentId.startsWith("mock_")) continue;
    checked += 1;

    const status = await client.getDocumentStatus(documentId);
    if (!status.ok) {
      errors += 1;
      continue;
    }
    if (status.status !== "SIGNED") continue;

    const result = await mockSignContract({
      attemptId: attempt.id as string,
      easylexContractId: documentId,
      // eventId estable → dedup en easylex_events al re-sincronizar.
      eventId: `cycle-sync-${attempt.id}`,
      signedAt: new Date().toISOString(),
      rawPayload: { source: "cycle_sync", documentId, status: "SIGNED" },
    });
    if (result.status === "signed") newlySigned += 1;
  }

  return { checked, newlySigned, errors };
}
