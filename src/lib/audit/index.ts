import { getSupabaseAdmin } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import type { Actor } from "@/lib/auth/roles";

/**
 * Registro de evidencia.
 *
 * Dos niveles con propósitos distintos, que no deben mezclarse:
 *
 * - `audit_events`     → producto operativo. Resumen legible, estado anterior y
 *                        nuevo, origen y actor. Lo consulta soporte.
 * - `integration_logs` → depuración. Payloads crudos, endpoint, código HTTP.
 *
 * Antes esta lógica estaba copiada en seis archivos, cada uno con su propio
 * helper privado. Nada garantizaba que registraran los mismos campos.
 */

export type AuditSource = "csv" | "whatsapp" | "backend" | "easylex" | "backoffice" | "system";
export type IntegrationProvider = "whatsapp" | "easylex" | "supabase" | "backend";
export type IntegrationDirection = "inbound" | "outbound" | "internal";

type JsonRecord = Record<string, unknown>;

export type RecordAuditEventInput = {
  eventName: string;
  summary: string;
  source: AuditSource;
  entityType?: string | null;
  /** Debe ser un uuid o null: la columna es de tipo uuid. */
  entityId?: string | null;
  employeeId?: string | null;
  correlationId?: string | null;
  previousState?: string | null;
  newState?: string | null;
  metadata?: JsonRecord;
  /**
   * Quién ejecutó la acción. Pasar el actor de la sesión cuando la acción
   * viene del backoffice: sin esto no se puede saber quién regeneró un link o
   * quién corrigió teléfonos en masa.
   */
  actor?: Actor | null;
  /** Para acciones sin usuario (webhooks, jobs). Por defecto `system`. */
  actorType?: string;
};

export async function recordAuditEvent(input: RecordAuditEventInput): Promise<void> {
  const supabase = getSupabaseAdmin();

  const metadata: JsonRecord = { ...(input.metadata ?? {}) };

  // El correo se guarda en metadata y no en actor_id, que es uuid.
  if (input.actor?.email) {
    metadata.actor_email = input.actor.email;
    metadata.actor_role = input.actor.role;
  }

  const { error } = await supabase.from("audit_events").insert({
    event_name: input.eventName,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    employee_id: input.employeeId ?? null,
    correlation_id: input.correlationId ?? null,
    source: input.source,
    previous_state: input.previousState ?? null,
    new_state: input.newState ?? null,
    summary: input.summary,
    metadata,
    actor_type: input.actorType ?? (input.actor ? "internal_operator" : "system"),
    actor_id: input.actor?.userId ?? null,
  });

  if (error) {
    // La auditoría no debe tumbar la operación que la genera, pero un fallo
    // silencioso deja el sistema sin evidencia: se registra en voz alta.
    logger.error("audit.record_failed", error, {
      eventName: input.eventName,
      entityType: input.entityType,
      entityId: input.entityId,
    });
    throw error;
  }
}

export type RecordIntegrationLogInput = {
  provider: IntegrationProvider;
  direction: IntegrationDirection;
  endpoint: string;
  method: string;
  success: boolean;
  requestPayload?: JsonRecord;
  responsePayload?: JsonRecord;
  statusCode?: number;
  errorMessage?: string | null;
  correlationId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
};

export async function recordIntegrationLog(input: RecordIntegrationLogInput): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { error } = await supabase.from("integration_logs").insert({
    provider: input.provider,
    direction: input.direction,
    endpoint: input.endpoint,
    method: input.method,
    request_payload: input.requestPayload ?? {},
    response_payload: input.responsePayload ?? {},
    status_code: input.statusCode ?? (input.success ? 200 : 500),
    status: input.success ? "success" : "failed",
    success: input.success,
    error_message: input.errorMessage ?? null,
    correlation_id: input.correlationId ?? null,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
  });

  if (error) {
    // A diferencia de la auditoría, el log técnico no se propaga: perder una
    // línea de depuración no justifica abortar la operación.
    logger.error("integration_log.record_failed", error, {
      provider: input.provider,
      endpoint: input.endpoint,
    });
  }
}
