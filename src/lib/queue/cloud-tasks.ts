import { google } from "googleapis";
import { cloudTasksEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import type { QueueDriver, QueueTask, EnqueueResult } from "./types";

/**
 * Driver de Google Cloud Tasks.
 *
 * Usa `googleapis`, que ya es dependencia del proyecto, en vez de
 * `@google-cloud/tasks`. La autenticación es ADC (Application Default
 * Credentials), que en Cloud Run funciona sin configuración: toma la identidad
 * del servicio.
 *
 * Por qué una tarea por mensaje y no una por lote:
 *
 * - El límite de velocidad hacia Meta lo aplica la cola
 *   (`maxDispatchesPerSecond`), no un `sleep` en el código.
 * - Cada mensaje reintenta de forma independiente con backoff exponencial.
 * - Un fallo aislado no arrastra a los otros 99 del lote.
 */

/** Cuántas creaciones de tarea lanzar en paralelo contra la API de Cloud Tasks. */
const ENQUEUE_CONCURRENCY = 20;

export class CloudTasksDriver implements QueueDriver {
  readonly kind = "cloud-tasks" as const;

  async enqueue(workerPath: string, tasks: QueueTask[]): Promise<EnqueueResult> {
    if (tasks.length === 0) {
      return { enqueued: 0, failed: 0, errors: [] };
    }

    const auth = new google.auth.GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });
    const cloudtasks = google.cloudtasks({ version: "v2", auth });

    const parent =
      `projects/${cloudTasksEnv.projectId}` +
      `/locations/${cloudTasksEnv.location}` +
      `/queues/${cloudTasksEnv.queue}`;

    const workerUrl = new URL(workerPath, cloudTasksEnv.workerBaseUrl).toString();

    const result: EnqueueResult = { enqueued: 0, failed: 0, errors: [] };

    // Cloud Tasks no tiene API de creación por lotes, así que se crean con
    // concurrencia acotada para no saturar la API ni el event loop.
    for (let i = 0; i < tasks.length; i += ENQUEUE_CONCURRENCY) {
      const slice = tasks.slice(i, i + ENQUEUE_CONCURRENCY);

      const outcomes = await Promise.allSettled(
        slice.map((task) =>
          cloudtasks.projects.locations.queues.tasks.create({
            parent,
            requestBody: {
              task: {
                // El nombre da deduplicación: si se reintenta el encolado, la
                // segunda creación falla con ALREADY_EXISTS en vez de duplicar.
                name: `${parent}/tasks/${task.id}`,
                httpRequest: {
                  httpMethod: "POST",
                  url: workerUrl,
                  headers: { "Content-Type": "application/json" },
                  body: Buffer.from(JSON.stringify(task.payload)).toString("base64"),
                  oidcToken: {
                    serviceAccountEmail: cloudTasksEnv.invokerServiceAccount,
                    audience: workerUrl,
                  },
                },
              },
            },
          }),
        ),
      );

      outcomes.forEach((outcome, index) => {
        const task = slice[index];

        if (outcome.status === "fulfilled") {
          result.enqueued += 1;
          return;
        }

        const error = outcome.reason as { code?: number; message?: string };

        // 409 ALREADY_EXISTS significa que esta tarea ya estaba encolada.
        // Es el resultado esperado de un reintento, no un fallo.
        if (error?.code === 409) {
          logger.info("queue.cloud_tasks.duplicate_ignored", { taskId: task.id });
          result.enqueued += 1;
          return;
        }

        result.failed += 1;
        result.errors.push({ id: task.id, error: error?.message ?? "Error desconocido" });
        logger.error("queue.cloud_tasks.enqueue_failed", outcome.reason, { taskId: task.id });
      });
    }

    logger.info("queue.cloud_tasks.enqueued", {
      queue: cloudTasksEnv.queue,
      workerUrl,
      enqueued: result.enqueued,
      failed: result.failed,
    });

    return result;
  }
}
