/**
 * Logger estructurado para el backoffice.
 *
 * Formato de salida JSON para facilitar parsing en producción.
 * En desarrollo usa console.* para legibilidad.
 *
 * Uso:
 *   import { logger } from "@/lib/logger";
 *   logger.info("bulk_send.completed", { bulkSendId, sent, failed });
 *   logger.error("whatsapp.send_failed", err, { employeeId, templateName });
 */

type LogLevel = "info" | "warn" | "error" | "debug" | "critical";

type LogContext = Record<string, unknown>;

function formatLog(level: LogLevel, message: string, context?: LogContext, error?: unknown) {
  const entry: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(context ?? {}),
  };

  if (error) {
    if (error instanceof Error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      };
    } else {
      entry.error = String(error);
    }
  }

  return entry;
}

function log(level: LogLevel, message: string, context?: LogContext, error?: unknown) {
  const entry = formatLog(level, message, context, error);

  if (process.env.NODE_ENV === "development") {
    // En desarrollo: formato legible
    const prefix = `[${entry.timestamp}] [${level.toUpperCase()}] ${message}`;
    if (level === "error") {
      console.error(prefix, context ?? "", error ?? "");
    } else if (level === "warn") {
      console.warn(prefix, context ?? "");
    } else {
      console.log(prefix, context ?? "");
    }
  } else {
    // En producción: JSON estructurado (para Vercel logs, etc.)
    const output = JSON.stringify(entry);
    if (level === "error") {
      console.error(output);
    } else if (level === "warn") {
      console.warn(output);
    } else {
      console.log(output);
    }
  }
}

export const logger = {
  /**
   * Eventos informativos: operaciones completadas, datos cargados, etc.
   * @param message Identificador del evento (ej: "bulk_send.completed")
   * @param context Datos adicionales de contexto
   */
  info: (message: string, context?: LogContext) => log("info", message, context),

  /**
   * Advertencias: situaciones no críticas que merecen atención.
   * @param message Identificador del evento (ej: "whatsapp.rate_limit_warning")
   * @param context Datos adicionales de contexto
   */
  warn: (message: string, context?: LogContext) => log("warn", message, context),

  /**
   * Errores: fallos que impiden completar una operación.
   * @param message Identificador del evento (ej: "whatsapp.send_failed")
   * @param error El error capturado
   * @param context Datos adicionales de contexto (employeeId, etc.)
   */
  error: (message: string, error?: unknown, context?: LogContext) =>
    log("error", message, context, error),

  /**
   * Debug: solo visible en desarrollo.
   * @param message Identificador del evento
   * @param context Datos adicionales
   */
  debug: (message: string, context?: LogContext) => {
    if (process.env.NODE_ENV === "development") {
      log("debug", message, context);
    }
  },
};
