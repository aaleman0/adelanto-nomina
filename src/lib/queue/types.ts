/**
 * Abstracción de cola de trabajos.
 *
 * Existen dos implementaciones:
 *
 * - `inline`  — procesa dentro del propio request. Es el comportamiento
 *               histórico y el que se usa en desarrollo y en tests.
 * - `cloud-tasks` — encola en Google Cloud Tasks y devuelve de inmediato.
 *
 * El driver se elige por configuración, así que el código de negocio no sabe
 * cuál está activo. Permite migrar a la cola sin reescribir la lógica de envío
 * y volver atrás cambiando una variable de entorno.
 */

export type QueueTask = {
  /**
   * Identificador estable de la tarea. Cloud Tasks lo usa como nombre, lo que
   * le da deduplicación: encolar dos veces el mismo id no genera dos entregas.
   * Debe cumplir [A-Za-z0-9_-]{1,500} (un UUID vale).
   */
  id: string;
  payload: Record<string, unknown>;
};

export type EnqueueResult = {
  enqueued: number;
  failed: number;
  errors: Array<{ id: string; error: string }>;
};

export interface QueueDriver {
  readonly kind: "cloud-tasks" | "inline";
  /** Ruta relativa del worker que procesará las tareas, p. ej. `/api/tasks/...`. */
  enqueue(workerPath: string, tasks: QueueTask[]): Promise<EnqueueResult>;
}
