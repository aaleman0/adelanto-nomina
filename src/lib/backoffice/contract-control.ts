import { getSupabaseAdmin } from "@/lib/supabase/server";

export type ContractControlRow = {
  employee_id: string;
  offer_id: string | null;
  contract_request_id: string | null;
  contract_attempt_id: string | null;
  empleado: string | null;
  nombre: string | null;
  apellidos: string | null;
  rfc: string | null;
  telefono_normalizado: string | null;
  email: string | null;
  empleador: string | null;
  monto_prestamo_autorizado: number | null;
  is_eligible: boolean | null;
  offer_status: string | null;
  estatus_conversion: string | null;
  manychat_message_id: string | null;
  message_status: string | null;
  message_sent_at: string | null;
  message_delivered_at: string | null;
  message_clicked_at: string | null;
  message_error: string | null;
  manychat_subscriber_id: string | null;
  contract_status: string | null;
  contract_requested_at: string | null;
  contract_signed_at: string | null;
  contract_error: string | null;
  easylex_contract_id: string | null;
  signing_url: string | null;
  contract_attempt_status: string | null;
  contract_generated_at: string | null;
  link_expires_at: string | null;
  attempt_signed_at: string | null;
  attempt_error: string | null;
  operational_status: ContractOperationalStatus;
  last_movement_at: string | null;
  last_audit_event: string | null;
  last_audit_summary: string | null;
  last_audit_source: string | null;
  last_audit_at: string | null;
};

export type ContractOperationalStatus =
  | "pendiente_envio"
  | "mensaje_enviado"
  | "solicitado"
  | "contrato_en_proceso"
  | "contrato_generado"
  | "link_expirado"
  | "firmado"
  | "error"
  | "no_elegible";

export type ContractControlMetricKey =
  | "pendingSend"
  | "messageSent"
  | "requested"
  | "contractGenerated"
  | "signed"
  | "expired"
  | "errors";

export type ContractControlMetric = {
  key: ContractControlMetricKey;
  label: string;
  value: number;
};

export type ContractControlFilters = {
  q?: string;
  status?: ContractOperationalStatus | "all";
  empleador?: string;
};

export type ContractControlData = {
  rows: ContractControlRow[];
  metrics: ContractControlMetric[];
  empleadores: string[];
  total: number;
  limit: number;
};

export const EMPTY_CONTRACT_CONTROL_METRICS: ContractControlMetric[] = [
  { key: "pendingSend", label: "Pendiente envio", value: 0 },
  { key: "messageSent", label: "Mensaje enviado", value: 0 },
  { key: "requested", label: "Solicitudes", value: 0 },
  { key: "contractGenerated", label: "Contrato generado", value: 0 },
  { key: "signed", label: "Firmados", value: 0 },
  { key: "expired", label: "Links expirados", value: 0 },
  { key: "errors", label: "Errores", value: 0 },
];

export const CONTRACT_CONTROL_SELECT = [
  "employee_id",
  "offer_id",
  "contract_request_id",
  "contract_attempt_id",
  "empleado",
  "nombre",
  "apellidos",
  "rfc",
  "telefono_normalizado",
  "email",
  "empleador",
  "monto_prestamo_autorizado",
  "is_eligible",
  "offer_status",
  "estatus_conversion",
  "manychat_message_id",
  "message_status",
  "message_sent_at",
  "message_delivered_at",
  "message_clicked_at",
  "message_error",
  "manychat_subscriber_id",
  "contract_status",
  "contract_requested_at",
  "contract_signed_at",
  "contract_error",
  "easylex_contract_id",
  "signing_url",
  "contract_attempt_status",
  "contract_generated_at",
  "link_expires_at",
  "attempt_signed_at",
  "attempt_error",
  "operational_status",
  "last_movement_at",
  "last_audit_event",
  "last_audit_summary",
  "last_audit_source",
  "last_audit_at",
].join(", ");

export async function getContractControlData(
  filters: ContractControlFilters = {},
): Promise<ContractControlData> {
  const supabase = getSupabaseAdmin();
  const limit = 50;
  let query = supabase
    .from("backoffice_contract_control_v1")
    .select(CONTRACT_CONTROL_SELECT);

  if (filters.status && filters.status !== "all") {
    query = query.eq("operational_status", filters.status);
  }

  if (filters.empleador) {
    query = query.eq("empleador", filters.empleador);
  }

  if (filters.q) {
    const term = escapePostgrestSearch(filters.q.trim());
    query = query.or(
      [
        `empleado.ilike.%${term}%`,
        `rfc.ilike.%${term}%`,
        `telefono_normalizado.ilike.%${term}%`,
        `manychat_subscriber_id.ilike.%${term}%`,
      ].join(","),
    );
  }

  const { data, error } = await query
    .order("last_movement_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as unknown as ContractControlRow[];

  return {
    rows,
    metrics: buildContractControlMetrics(rows),
    empleadores: await getEmpleadores(),
    total: rows.length,
    limit,
  };
}

export function parseContractOperationalStatus(value: string | undefined) {
  const allowed = new Set<ContractOperationalStatus>([
    "pendiente_envio",
    "mensaje_enviado",
    "solicitado",
    "contrato_en_proceso",
    "contrato_generado",
    "link_expirado",
    "firmado",
    "error",
    "no_elegible",
  ]);

  return value && allowed.has(value as ContractOperationalStatus)
    ? (value as ContractOperationalStatus)
    : "all";
}

async function getEmpleadores() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("backoffice_contract_control_v1")
    .select("empleador")
    .not("empleador", "is", null)
    .order("empleador", { ascending: true })
    .limit(500);

  if (error) {
    throw error;
  }

  return Array.from(
    new Set(
      ((data ?? []) as Array<{ empleador: string | null }>)
        .map((row) => row.empleador)
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function buildContractControlMetrics(
  rows: ContractControlRow[],
): ContractControlMetric[] {
  const count = (predicate: (row: ContractControlRow) => boolean) =>
    rows.filter(predicate).length;

  return [
    {
      key: "pendingSend",
      label: "Pendiente envio",
      value: count((row) => row.operational_status === "pendiente_envio"),
    },
    {
      key: "messageSent",
      label: "Mensaje enviado",
      value: count((row) =>
        [
          "mensaje_enviado",
          "solicitado",
          "contrato_en_proceso",
          "contrato_generado",
          "link_expirado",
          "firmado",
        ].includes(row.operational_status),
      ),
    },
    {
      key: "requested",
      label: "Solicitudes",
      value: count((row) =>
        [
          "solicitado",
          "contrato_en_proceso",
          "contrato_generado",
          "link_expirado",
          "firmado",
        ].includes(row.operational_status),
      ),
    },
    {
      key: "contractGenerated",
      label: "Contrato generado",
      value: count((row) =>
        ["contrato_generado", "link_expirado", "firmado"].includes(
          row.operational_status,
        ),
      ),
    },
    {
      key: "signed",
      label: "Firmados",
      value: count((row) => row.operational_status === "firmado"),
    },
    {
      key: "expired",
      label: "Links expirados",
      value: count((row) => row.operational_status === "link_expirado"),
    },
    {
      key: "errors",
      label: "Errores",
      value: count((row) => row.operational_status === "error"),
    },
  ];
}

function escapePostgrestSearch(value: string) {
  return value.replace(/[%_,]/g, "");
}
