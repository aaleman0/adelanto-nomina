import { cloudTasksEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { CloudTasksDriver } from "./cloud-tasks";
import type { QueueDriver, QueueTask, EnqueueResult } from "./types";

export type { QueueDriver, QueueTask, EnqueueResult } from "./types";

/**
 * Driver inline: no encola nada.
 *
 * Señala al llamador que debe procesar el trabajo dentro del propio request,
 * que es el comportamiento histórico del envío masivo. Es el valor por defecto,
 * así que sin configuración de GCP nada cambia.
 */
export class InlineDriver implements QueueDriver {
  readonly kind = "inline" as const;

  async enqueue(): Promise<EnqueueResult> {
    return { enqueued: 0, failed: 0, errors: [] };
  }
}

let cached: QueueDriver | null = null;

/**
 * Elige el driver activo.
 *
 * Orden de decisión:
 * 1. `QUEUE_DRIVER` fuerza uno concreto (útil para pruebas y para desactivar
 *    la cola en caliente sin quitar el resto de la configuración).
 * 2. Si Cloud Tasks está completamente configurado, se usa.
 * 3. En cualquier otro caso, inline.
 *
 * Nunca lanza: una cola mal configurada degrada a inline en vez de tumbar los
 * envíos.
 */
export function getQueueDriver(): QueueDriver {
  if (cached) return cached;

  const override = cloudTasksEnv.driverOverride;

  if (override === "inline") {
    cached = new InlineDriver();
  } else if (override === "cloud-tasks" || cloudTasksEnv.isConfigured) {
    if (!cloudTasksEnv.isConfigured) {
      logger.warn("queue.driver.override_incomplete", {
        detail: "QUEUE_DRIVER=cloud-tasks pero falta configuración; se usa inline.",
      });
      cached = new InlineDriver();
    } else {
      cached = new CloudTasksDriver();
    }
  } else {
    cached = new InlineDriver();
  }

  logger.info("queue.driver.selected", { kind: cached.kind });
  return cached;
}

/** Solo para tests: descarta el driver memorizado. */
export function resetQueueDriver() {
  cached = null;
}

export function isQueueEnabled(): boolean {
  return getQueueDriver().kind !== "inline";
}

export type { QueueTask as Task };
