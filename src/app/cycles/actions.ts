"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/roles";
import { syncBatchSignatures } from "@/lib/contracts/sync-batch-signatures";

/**
 * "Actualizar estados": consulta EasyLex por los contratos del ciclo y marca los
 * ya firmados. Rol `operaciones` (las server actions no pasan por el proxy).
 */
export async function syncCycleStatusesAction(formData: FormData) {
  const batchId = String(formData.get("batch_id") ?? "").trim();
  if (!batchId) {
    redirect("/cycles");
  }

  const auth = await requireRole("operaciones");
  if (!auth.ok) {
    redirect(`/cycles/${batchId}?action_status=forbidden`);
  }

  let status: string;
  let nuevas = 0;
  try {
    const result = await syncBatchSignatures(batchId);
    nuevas = result.newlySigned;
    status = result.errors > 0 ? "sync_error" : "synced";
  } catch {
    status = "sync_error";
  }

  revalidatePath("/cycles");
  revalidatePath(`/cycles/${batchId}`);
  redirect(`/cycles/${batchId}?action_status=${status}&nuevas=${nuevas}`);
}
