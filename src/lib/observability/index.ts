/**
 * Capa de observabilidad, agnóstica del proveedor.
 *
 * El resto del código —y en particular el logger— reporta errores a través de
 * aquí, sin importar Sentry directamente. Dos razones:
 *
 * 1. El logger lo importan 32 archivos, algunos potencialmente en el runtime
 *    edge. Importar el SDK de Sentry de forma estática ahí engordaría el bundle
 *    del middleware. Este módulo no importa Sentry: el manejador real se
 *    registra en tiempo de arranque desde `instrumentation.ts`.
 *
 * 2. Cambiar de Sentry a otro proveedor no toca ningún sitio de llamada.
 *
 * Sin `SENTRY_DSN` no se registra ningún manejador y todo esto es un no-op.
 */

export type CaptureContext = Record<string, unknown>;

type CaptureHandler = (error: unknown, context?: CaptureContext) => void;

// El manejador vive en globalThis, no en una variable de módulo, para que sea
// un verdadero singleton por runtime. Un empaquetador puede materializar este
// módulo más de una vez (por alias vs. ruta relativa, o entre chunks); con
// estado de módulo, el arranque registraría en una instancia y el logger leería
// de otra, y no se reportaría nada. globalThis lo comparten todas. Es el mismo
// enfoque del hub global de Sentry.
const HANDLER_KEY = "__adelantos_capture_handler__";

type GlobalWithHandler = typeof globalThis & { [HANDLER_KEY]?: CaptureHandler | null };

/** Lo llama el arranque de Sentry una vez inicializado el SDK. */
export function registerCaptureHandler(fn: CaptureHandler): void {
  (globalThis as GlobalWithHandler)[HANDLER_KEY] = fn;
}

/**
 * Reporta un error al proveedor de observabilidad, si hay alguno activo.
 *
 * No lanza nunca: un fallo aquí no debe tumbar la operación que lo generó. Es
 * fire-and-forget a propósito.
 */
export function captureException(error: unknown, context?: CaptureContext): void {
  const handler = (globalThis as GlobalWithHandler)[HANDLER_KEY];
  if (!handler) return;
  try {
    handler(error, context);
  } catch {
    // Un error dentro del propio reporte de errores se traga en silencio: no
    // hay a dónde escalarlo sin arriesgar un bucle.
  }
}

/** Indica si hay DSN configurado. Lo usan los puntos de arranque. */
export function isSentryConfigured(): boolean {
  return Boolean(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN);
}

/** Entorno reportado a Sentry; cae a NODE_ENV si no se especifica. */
export function sentryEnvironment(): string {
  return process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development";
}

/**
 * Fracción de transacciones con tracing de rendimiento. Por defecto 0: el
 * tracing tiene coste y cuota, así que se activa explícitamente por entorno.
 */
export function sentryTracesSampleRate(): number {
  const raw = Number(process.env.SENTRY_TRACES_SAMPLE_RATE);
  return Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : 0;
}
