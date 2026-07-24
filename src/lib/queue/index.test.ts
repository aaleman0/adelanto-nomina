import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getQueueDriver, resetQueueDriver, isQueueEnabled, InlineDriver } from "./index";

const CLOUD_TASKS_VARS = [
  "GCP_PROJECT_ID",
  "CLOUD_TASKS_QUEUE",
  "TASKS_WORKER_BASE_URL",
  "TASKS_INVOKER_SERVICE_ACCOUNT",
  "QUEUE_DRIVER",
] as const;

const original: Record<string, string | undefined> = {};

function configureCloudTasks() {
  process.env.GCP_PROJECT_ID = "mi-proyecto";
  process.env.CLOUD_TASKS_QUEUE = "whatsapp-bulk";
  process.env.TASKS_WORKER_BASE_URL = "https://app.example.com";
  process.env.TASKS_INVOKER_SERVICE_ACCOUNT = "tasks@mi-proyecto.iam.gserviceaccount.com";
}

beforeEach(() => {
  for (const key of CLOUD_TASKS_VARS) {
    original[key] = process.env[key];
    delete process.env[key];
  }
  resetQueueDriver();
});

afterEach(() => {
  for (const key of CLOUD_TASKS_VARS) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
  resetQueueDriver();
});

describe("getQueueDriver", () => {
  it("usa inline cuando no hay configuración de Cloud Tasks", () => {
    expect(getQueueDriver().kind).toBe("inline");
    expect(isQueueEnabled()).toBe(false);
  });

  it("usa Cloud Tasks cuando la configuración está completa", () => {
    configureCloudTasks();
    expect(getQueueDriver().kind).toBe("cloud-tasks");
    expect(isQueueEnabled()).toBe(true);
  });

  it("QUEUE_DRIVER=inline desactiva la cola aunque esté configurada", () => {
    // Permite volver al envío síncrono sin desmontar la configuración de GCP.
    configureCloudTasks();
    process.env.QUEUE_DRIVER = "inline";
    expect(getQueueDriver().kind).toBe("inline");
  });

  it("degrada a inline si se fuerza cloud-tasks con configuración incompleta", () => {
    // Falla de forma segura: una cola mal configurada no debe tumbar los envíos.
    process.env.QUEUE_DRIVER = "cloud-tasks";
    process.env.GCP_PROJECT_ID = "mi-proyecto";
    expect(getQueueDriver().kind).toBe("inline");
  });

  it("degrada a inline si falta una sola variable", () => {
    configureCloudTasks();
    delete process.env.TASKS_INVOKER_SERVICE_ACCOUNT;
    expect(getQueueDriver().kind).toBe("inline");
  });

  it("memoriza el driver entre llamadas", () => {
    expect(getQueueDriver()).toBe(getQueueDriver());
  });

  it("resetQueueDriver descarta la memorización", () => {
    const inline = getQueueDriver();
    configureCloudTasks();
    resetQueueDriver();
    expect(getQueueDriver()).not.toBe(inline);
  });
});

describe("InlineDriver", () => {
  it("no encola nada: el llamador procesa en el propio request", async () => {
    const result = await new InlineDriver().enqueue();
    expect(result).toEqual({ enqueued: 0, failed: 0, errors: [] });
  });
});
