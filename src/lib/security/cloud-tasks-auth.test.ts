import { describe, it, expect, vi, afterEach } from "vitest";
import { authenticateWorkerRequest } from "./cloud-tasks-auth";

const URL_WORKER = "https://app.example.com/api/tasks/whatsapp/send-message";

function makeRequest(headers: Record<string, string> = {}) {
  return new Request(URL_WORKER, { method: "POST", headers });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("authenticateWorkerRequest — fuera de producción", () => {
  it("acepta el secreto compartido correcto", async () => {
    vi.stubEnv("TASKS_WORKER_SECRET", "s3cr3t");
    const result = await authenticateWorkerRequest(makeRequest({ "x-tasks-secret": "s3cr3t" }));
    expect(result).toEqual({ ok: true, via: "shared-secret" });
  });

  it("rechaza un secreto compartido incorrecto", async () => {
    vi.stubEnv("TASKS_WORKER_SECRET", "s3cr3t");
    const result = await authenticateWorkerRequest(makeRequest({ "x-tasks-secret": "malo" }));
    expect(result.ok).toBe(false);
  });

  it("permite sin credenciales, para poder disparar el worker a mano", async () => {
    const result = await authenticateWorkerRequest(makeRequest());
    expect(result).toEqual({ ok: true, via: "skipped-dev" });
  });

  it("rechaza un bearer que no es un token OIDC válido", async () => {
    const result = await authenticateWorkerRequest(
      makeRequest({ authorization: "Bearer no-es-un-jwt" }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("oidc_invalido");
  });
});

describe("authenticateWorkerRequest — en producción", () => {
  it("rechaza cuando no llega ninguna credencial", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const result = await authenticateWorkerRequest(makeRequest());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("sin_credenciales");
  });

  it("rechaza el secreto compartido aunque sea correcto", async () => {
    // Un secreto estático no caduca ni se rota: en producción solo vale OIDC.
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TASKS_WORKER_SECRET", "s3cr3t");
    const result = await authenticateWorkerRequest(makeRequest({ "x-tasks-secret": "s3cr3t" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("secreto_compartido_no_permitido_en_produccion");
  });

  it("rechaza un bearer inválido", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const result = await authenticateWorkerRequest(
      makeRequest({ authorization: "Bearer basura" }),
    );
    expect(result.ok).toBe(false);
  });
});
