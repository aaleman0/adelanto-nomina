import {
  CONTRACT_CONTROL_SELECT,
  type ContractControlRow,
} from "@/lib/backoffice/contract-control";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export type ContractTimelineRow = {
  employee_id: string;
  entity_type: string | null;
  entity_id: string | null;
  occurred_at: string;
  source: string;
  event_type: string;
  status: string | null;
  summary: string;
  metadata: Record<string, unknown> | null;
};

const CONTRACT_TIMELINE_SELECT = [
  "employee_id",
  "entity_type",
  "entity_id",
  "occurred_at",
  "source",
  "event_type",
  "status",
  "summary",
  "metadata",
].join(", ");

export async function getContractDetailData(employeeId: string) {
  const supabase = getSupabaseAdmin();
  const [controlResult, timelineResult] = await Promise.all([
    supabase
      .from("backoffice_contract_control_v1")
      .select(CONTRACT_CONTROL_SELECT)
      .eq("employee_id", employeeId)
      .maybeSingle(),
    supabase
      .from("backoffice_contract_timeline_v1")
      .select(CONTRACT_TIMELINE_SELECT)
      .eq("employee_id", employeeId)
      .order("occurred_at", { ascending: false })
      .limit(100),
  ]);

  if (controlResult.error) {
    throw controlResult.error;
  }

  if (timelineResult.error) {
    throw timelineResult.error;
  }

  return {
    control: controlResult.data as unknown as ContractControlRow | null,
    timeline: (timelineResult.data ?? []) as unknown as ContractTimelineRow[],
  };
}
