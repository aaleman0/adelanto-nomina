import {
  isSentryConfigured,
  registerCaptureHandler,
  sentryEnvironment,
  sentryTracesSampleRate,
  type CaptureContext,
} from "@/lib/observability";

/**
 * Arranque de Sentry en el servidor (runtimes nodejs y edge).
 *
 * Lo llama `register()` de `src/instrumentation.ts`. Sentry se importa de forma
 * DINÁMICA y solo cuando hay DSN: sin configurar, el SDK ni siquiera se carga,
 * así que la aplicación se comporta exactamente igual que antes de añadirlo.
 *
 * Es el mismo criterio del resto del proyecto: la cola cae a inline sin GCP,
 * RBAC arranca en warn, la CSP en report-only. Una pieza nueva no cambia el
 * comportamiento por defecto.
 */
export async function initSentryServer(): Promise<void> {
  if (!isSentryConfigured()) return;

  const Sentry = await import("@sentry/nextjs");

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: sentryEnvironment(),
    tracesSampleRate: sentryTracesSampleRate(),
    // Sin subida de source maps (no se usa withSentryConfig para no chocar con
    // Turbopack), así que los stack traces del servidor ya son legibles.
  });

  // A partir de aquí, logger.error/critical reportan a Sentry.
  registerCaptureHandler((error: unknown, context?: CaptureContext) => {
    Sentry.captureException(error, context ? { extra: context } : undefined);
  });
}
