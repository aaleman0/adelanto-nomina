import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * Happy-path de OIDC del worker de Cloud Tasks. Va en un archivo aparte del de
 * rechazos porque aquí se mockea `googleapis` (para simular un token válido sin
 * tocar la red), y el otro archivo depende de que la verificación real falle.
 */

const { verifyIdToken } = vi.hoisted(() => ({ verifyIdToken: vi.fn() }));

vi.mock("googleapis", () => ({
  // OAuth2 se instancia con `new`, así que debe ser función/clase, no arrow.
  google: { auth: { OAuth2: class { verifyIdToken = verifyIdToken; } } },
}));

import { authenticateWorkerRequest } from "./cloud-tasks-auth";

const SA = "cloud-tasks-invoker@proj.iam.gserviceaccount.com";

function workerRequest(url = "https://worker.example/api/tasks/whatsapp-send") {
  return new Request(url, { method: "POST", headers: { authorization: "Bearer tok" } });
}

function ticket(payload: Record<string, unknown> | null) {
  return { getPayload: () => payload };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("authenticateWorkerRequest — OIDC happy-path", () => {
  it("acepta un token OIDC válido de la service account esperada", async () => {
    vi.stubEnv("TASKS_INVOKER_SERVICE_ACCOUNT", SA);
    verifyIdToken.mockResolvedValue(ticket({ email_verified: true, email: SA }));

    const result = await authenticateWorkerRequest(workerRequest());

    expect(result).toEqual({ ok: true, via: "oidc" });
  });

  it("rechaza si la service account del token no es la esperada", async () => {
    vi.stubEnv("TASKS_INVOKER_SERVICE_ACCOUNT", SA);
    verifyIdToken.mockResolvedValue(ticket({ email_verified: true, email: "otra@proj.iam.gserviceaccount.com" }));

    const result = await authenticateWorkerRequest(workerRequest());

    expect(result).toEqual({ ok: false, reason: "service_account_inesperada" });
  });

  it("rechaza si el email del token no está verificado", async () => {
    vi.stubEnv("TASKS_INVOKER_SERVICE_ACCOUNT", SA);
    verifyIdToken.mockResolvedValue(ticket({ email_verified: false, email: SA }));

    const result = await authenticateWorkerRequest(workerRequest());

    expect(result).toEqual({ ok: false, reason: "email_no_verificado" });
  });

  it("en producción exige la service account configurada", async () => {
    vi.stubEnv("NODE_ENV", "production"); // sin TASKS_INVOKER_SERVICE_ACCOUNT
    verifyIdToken.mockResolvedValue(ticket({ email_verified: true, email: SA }));

    const result = await authenticateWorkerRequest(workerRequest());

    expect(result).toEqual({ ok: false, reason: "service_account_no_configurada_en_produccion" });
  });

  it("deriva el audience del origen configurado, no del Host entrante", async () => {
    vi.stubEnv("TASKS_INVOKER_SERVICE_ACCOUNT", SA);
    vi.stubEnv("TASKS_WORKER_BASE_URL", "https://real-worker.run.app");
    verifyIdToken.mockResolvedValue(ticket({ email_verified: true, email: SA }));

    // Host falsificado en la petición; el audience debe usar el origen configurado.
    await authenticateWorkerRequest(workerRequest("https://atacante.example/api/tasks/whatsapp-send"));

    expect(verifyIdToken).toHaveBeenCalledWith({
      idToken: "tok",
      audience: "https://real-worker.run.app/api/tasks/whatsapp-send",
    });
  });
});
