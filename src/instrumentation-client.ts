/**
 * Instrumentación del cliente (navegador).
 *
 * Next ejecuta este archivo al cargar la aplicación en el cliente. Inicializa
 * Sentry solo si hay DSN público; sin él, no se carga el SDK ni se envía nada.
 *
 * El DSN del cliente es distinto y va en NEXT_PUBLIC_SENTRY_DSN porque queda
 * expuesto en el bundle del navegador (los DSN de Sentry están pensados para
 * ser públicos: solo permiten enviar eventos, no leerlos).
 */

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  import("@sentry/nextjs").then((Sentry) => {
    Sentry.init({
      dsn,
      environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV,
      // El tracing de navegador se activa por separado y arranca en 0.
      tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE) || 0,
    });
  });
}

/**
 * Reporta errores de navegación entre rutas. Sin DSN, este export sigue siendo
 * seguro: Sentry no está inicializado y la llamada es un no-op.
 */
export async function onRouterTransitionStart(...args: unknown[]): Promise<void> {
  if (!dsn) return;
  const Sentry = await import("@sentry/nextjs");
  const hook = (Sentry as unknown as {
    captureRouterTransitionStart?: (...a: unknown[]) => void;
  }).captureRouterTransitionStart;
  hook?.(...args);
}
