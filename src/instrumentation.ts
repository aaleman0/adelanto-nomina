import type { Instrumentation } from "next";

/**
 * Punto de instrumentación de Next.js (hook nativo, sin plugin de build).
 *
 * `register()` corre una vez al iniciar cada instancia del servidor;
 * `onRequestError` captura los errores de servidor que Next intercepta. Ambos
 * funcionan con Turbopack desde Next 14.0.4 —aquí es 16.2— así que no hace
 * falta el envoltorio webpack de Sentry.
 */

export async function register(): Promise<void> {
  // Cubre nodejs y edge; el arranque no hace nada sin DSN.
  const { initSentryServer } = await import("./lib/observability/sentry-server");
  await initSentryServer();
}

/**
 * Reporta a Sentry los errores de servidor (render, route handlers, acciones).
 *
 * Se importa Sentry de forma perezosa y solo si hay DSN, para no cargar el SDK
 * cuando la observabilidad está desactivada.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (!process.env.SENTRY_DSN) return;

  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(err, request, context);
};
