import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  captureException,
  registerCaptureHandler,
  isSentryConfigured,
  sentryEnvironment,
  sentryTracesSampleRate,
} from "@/lib/observability";

// El setup global (src/test/setup.ts) mockea @/lib/logger para silenciar la
// salida. Para probar el reenvío real hay que traer la implementación de
// verdad; el mock la sustituiría por un vi.fn() que no llama a nada.
const { logger } = await vi.importActual<typeof import("@/lib/logger")>("@/lib/logger");

/**
 * El manejador es estado de módulo global. Reinstalarlo antes de cada test
 * garantiza aislamiento, ya que no hay forma de "desregistrar".
 */
beforeEach(() => {
  registerCaptureHandler(() => {});
  vi.unstubAllEnvs();
});

describe("captureException", () => {
  it("reenvía el error y el contexto al manejador registrado", () => {
    const handler = vi.fn();
    registerCaptureHandler(handler);

    const error = new Error("boom");
    captureException(error, { employeeId: "e1" });

    expect(handler).toHaveBeenCalledWith(error, { employeeId: "e1" });
  });

  it("no lanza si el manejador falla (fire-and-forget)", () => {
    registerCaptureHandler(() => {
      throw new Error("el reporte falló");
    });
    // No debe propagar: un fallo reportando no puede tumbar la operación.
    expect(() => captureException(new Error("x"))).not.toThrow();
  });
});

describe("logger → observabilidad", () => {
  it("logger.error reenvía a captureException con el evento en el contexto", () => {
    const handler = vi.fn();
    registerCaptureHandler(handler);

    const error = new Error("db caído");
    logger.error("db.connection_failed", error, { host: "primary" });

    expect(handler).toHaveBeenCalledTimes(1);
    const [reportedError, context] = handler.mock.calls[0];
    expect(reportedError).toBe(error);
    expect(context).toMatchObject({ host: "primary", event: "db.connection_failed", level: "error" });
  });

  it("logger.info NO reporta a observabilidad", () => {
    const handler = vi.fn();
    registerCaptureHandler(handler);

    logger.info("bulk_send.completed", { sent: 10 });

    expect(handler).not.toHaveBeenCalled();
  });

  it("logger.error sin objeto de error sintetiza uno con el mensaje", () => {
    const handler = vi.fn();
    registerCaptureHandler(handler);

    logger.error("algo.falló");

    const [reportedError] = handler.mock.calls[0];
    expect(reportedError).toBeInstanceOf(Error);
    expect((reportedError as Error).message).toBe("algo.falló");
  });
});

describe("configuración desde entorno", () => {
  it("isSentryConfigured refleja la presencia de DSN", () => {
    expect(isSentryConfigured()).toBe(false);
    vi.stubEnv("SENTRY_DSN", "https://k@o0.ingest.sentry.io/0");
    expect(isSentryConfigured()).toBe(true);
  });

  it("sentryEnvironment cae a NODE_ENV cuando no se especifica", () => {
    vi.stubEnv("SENTRY_ENVIRONMENT", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(sentryEnvironment()).toBe("production");

    vi.stubEnv("SENTRY_ENVIRONMENT", "staging");
    expect(sentryEnvironment()).toBe("staging");
  });

  it("sentryTracesSampleRate por defecto es 0 y acota fuera de [0,1]", () => {
    vi.stubEnv("SENTRY_TRACES_SAMPLE_RATE", "");
    expect(sentryTracesSampleRate()).toBe(0);

    vi.stubEnv("SENTRY_TRACES_SAMPLE_RATE", "0.25");
    expect(sentryTracesSampleRate()).toBe(0.25);

    vi.stubEnv("SENTRY_TRACES_SAMPLE_RATE", "5");
    expect(sentryTracesSampleRate()).toBe(0);
  });
});
