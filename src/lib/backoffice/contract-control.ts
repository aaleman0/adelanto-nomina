import { getReadClient } from "@/lib/supabase/read-client";

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
  whatsapp_message_id: string | null;
  message_status: string | null;
  message_sent_at: string | null;
  message_delivered_at: string | null;
  message_clicked_at: string | null;
  message_error: string | null;
  whatsapp_subscriber_id: string | null;
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
  page?: number;
};

export type ContractControlData = {
  rows: ContractControlRow[];
  metrics: ContractControlMetric[];
  empleadores: string[];
  total: number;
  limit: number;
  page: number;
  totalPages: number;
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
  "whatsapp_message_id",
  "message_status",
  "message_sent_at",
  "message_delivered_at",
  "message_clicked_at",
  "message_error",
  "whatsapp_subscriber_id",
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

/**
 * Estados en los que el OPERADOR es el bloqueo, ordenados por urgencia. Los
 * demás están en vuelo (esperando al empleado) o cerrados, y no requieren
 * acción. Esta es la diferencia de propósito entre el cockpit y Contratos: el
 * cockpit muestra "lo que hay que hacer"; Contratos es el archivo completo.
 */
export const ACTION_REQUIRED_STATUSES: ContractOperationalStatus[] = [
  "error",
  "link_expirado",
  "pendiente_envio",
];

/**
 * Cola de acción del cockpit: solo los expedientes que requieren que el
 * operador haga algo, ordenados por urgencia (error → link vencido →
 * pendiente) y, dentro de cada grupo, por actividad más reciente.
 */
export async function getActionQueue(limit = 50): Promise<ContractControlRow[]> {
  const supabase = await getReadClient();

  const { data, error } = await supabase
    .from("backoffice_contract_control_v1")
    .select(CONTRACT_CONTROL_SELECT)
    .in("operational_status", ACTION_REQUIRED_STATUSES)
    .order("last_movement_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  const rows = (data ?? []) as unknown as ContractControlRow[];

  // El orden por urgencia se aplica aquí: PostgREST no ordena por una lista
  // arbitraria de valores, y son ≤ limit filas, así que ordenar en memoria es
  // trivial y mantiene el "más reciente primero" dentro de cada grupo.
  const rank = new Map(ACTION_REQUIRED_STATUSES.map((status, index) => [status, index]));
  return rows.sort(
    (a, b) => (rank.get(a.operational_status) ?? 99) - (rank.get(b.operational_status) ?? 99),
  );
}

export async function getContractControlData(
  filters: ContractControlFilters = {},
): Promise<ContractControlData> {
  const supabase = await getReadClient();
  const limit = 50;
  // Página mínima 1, sin máximo aquí (se acota después con totalPages).
  const page = Math.max(1, filters.page ?? 1);
  const offset = (page - 1) * limit;

  const term = filters.q ? escapePostgrestSearch(filters.q.trim()) : null;
  const orClause = term
    ? [
        `empleado.ilike.%${term}%`,
        `rfc.ilike.%${term}%`,
        `telefono_normalizado.ilike.%${term}%`,
        `whatsapp_subscriber_id.ilike.%${term}%`,
      ].join(",")
    : null;

  // Query 1: filas de la página actual con filtros aplicados.
  let rowsQuery = supabase
    .from("backoffice_contract_control_v1")
    .select(CONTRACT_CONTROL_SELECT);
  if (filters.status && filters.status !== "all") rowsQuery = rowsQuery.eq("operational_status", filters.status);
  if (filters.empleador) rowsQuery = rowsQuery.eq("empleador", filters.empleador);
  if (orClause) rowsQuery = rowsQuery.or(orClause);
  const rowsQueryFinal = rowsQuery
    .order("last_movement_at", { ascending: false })
    .range(offset, offset + limit - 1);

  // Query 2: COUNT real con los mismos filtros (para calcular totalPages).
  let countQuery = supabase
    .from("backoffice_contract_control_v1")
    .select("employee_id", { count: "exact", head: true });
  if (filters.status && filters.status !== "all") countQuery = countQuery.eq("operational_status", filters.status);
  if (filters.empleador) countQuery = countQuery.eq("empleador", filters.empleador);
  if (orClause) countQuery = countQuery.or(orClause);

  // Query 3: métricas globales sin filtros (reflejan el universo completo).
  const metricsQuery = supabase
    .from("backoffice_contract_control_v1")
    .select("operational_status");

  const [rowsResult, countResult, metricsResult, empleadores] = await Promise.all([
    rowsQueryFinal,
    countQuery,
    metricsQuery,
    getEmpleadores(),
  ]);

  if (rowsResult.error) throw rowsResult.error;
  if (countResult.error) throw countResult.error;
  if (metricsResult.error) throw metricsResult.error;

  const rows = (rowsResult.data ?? []) as unknown as ContractControlRow[];
  const total = countResult.count ?? rows.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const allStatuses = (metricsResult.data ?? []) as Array<{ operational_status: ContractOperationalStatus }>;

  return {
    rows,
    metrics: buildContractControlMetrics(allStatuses),
    empleadores,
    total,
    limit,
    page,
    totalPages,
  };
}

/**
 * Parsea el parámetro de página de la URL.
 * Garantiza que el resultado sea un entero >= 1.
 */
export function parsePageParam(value: string | undefined): number {
  const n = parseInt(value ?? "1", 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
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
  const supabase = await getReadClient();
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
  rows: Array<{ operational_status: ContractOperationalStatus }>,
): ContractControlMetric[] {
  // Cada fila cuenta una sola vez en su estado exacto (no acumulativo).
  const count = (status: ContractOperationalStatus | ContractOperationalStatus[]) => {
    const statuses = Array.isArray(status) ? status : [status];
    return rows.filter((row) => statuses.includes(row.operational_status)).length;
  };

  return [
    {
      key: "pendingSend",
      label: "Pendiente envio",
      value: count("pendiente_envio"),
    },
    {
      key: "messageSent",
      label: "Mensaje enviado",
      value: count("mensaje_enviado"),
    },
    {
      key: "requested",
      label: "Solicitudes",
      value: count(["solicitado", "contrato_en_proceso"]),
    },
    {
      key: "contractGenerated",
      label: "Contrato generado",
      value: count("contrato_generado"),
    },
    {
      key: "signed",
      label: "Firmados",
      value: count("firmado"),
    },
    {
      key: "expired",
      label: "Links expirados",
      value: count("link_expirado"),
    },
    {
      key: "errors",
      label: "Errores",
      value: count("error"),
    },
  ];
}

export type DashboardKpis = {
  totalElegibles: number;
  firmados: number;
  expiringLinks: ExpiringLinkRow[];
};

export type ExpiringLinkRow = {
  employee_id: string;
  empleado: string | null;
  empleador: string | null;
  monto_prestamo_autorizado: number | null;
  link_expires_at: string;
  signing_url: string | null;
};

export async function getDashboardKpis(): Promise<DashboardKpis> {
  const supabase = await getReadClient();

  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const [eligibleResult, firmadosResult, expiringResult] = await Promise.all([
    // Total de empleados elegibles
    supabase
      .from("backoffice_contract_control_v1")
      .select("employee_id", { count: "exact", head: true })
      .eq("is_eligible", true),

    // Total firmados
    supabase
      .from("backoffice_contract_control_v1")
      .select("employee_id", { count: "exact", head: true })
      .eq("operational_status", "firmado"),

    // Links que expiran en las próximas 24h (solo los aún vigentes)
    supabase
      .from("backoffice_contract_control_v1")
      .select("employee_id, empleado, empleador, monto_prestamo_autorizado, link_expires_at, signing_url")
      .gt("link_expires_at", now.toISOString())
      .lte("link_expires_at", in24h.toISOString())
      .order("link_expires_at", { ascending: true }),
  ]);

  if (eligibleResult.error) throw eligibleResult.error;
  if (firmadosResult.error) throw firmadosResult.error;
  if (expiringResult.error) throw expiringResult.error;

  return {
    totalElegibles: eligibleResult.count ?? 0,
    firmados: firmadosResult.count ?? 0,
    expiringLinks: (expiringResult.data ?? []) as ExpiringLinkRow[],
  };
}

function escapePostgrestSearch(value: string) {
  return value.replace(/[%_,]/g, "");
}
