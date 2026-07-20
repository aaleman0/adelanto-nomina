/**
 * Validación de variables de entorno con Zod.
 *
 * Se valida de forma lazy (en runtime, no en startup) para permitir
 * que la app corra sin WhatsApp configurado y mostrar el error de
 * configuración en la UI en lugar de crashear el servidor.
 *
 * Para validación estricta al inicio, usar `validateWhatsAppEnv()` explícitamente.
 */

import { z } from "zod";
import { logger } from "@/lib/logger";

/* ─── Schemas ─── */

const whatsAppEnvSchema = z.object({
  WHATSAPP_ACCESS_TOKEN: z.string().min(1, "WHATSAPP_ACCESS_TOKEN es requerido"),
  WHATSAPP_PHONE_NUMBER_ID: z.string().min(1, "WHATSAPP_PHONE_NUMBER_ID es requerido"),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().min(1, "WHATSAPP_BUSINESS_ACCOUNT_ID es requerido"),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().min(1, "WHATSAPP_WEBHOOK_VERIFY_TOKEN es requerido"),
  WHATSAPP_APP_SECRET: z.string().min(1, "WHATSAPP_APP_SECRET es requerido"),
  WHATSAPP_BUSINESS_NUMBER: z
    .string()
    .regex(
      /^\+?\d{10,15}$/,
      "WHATSAPP_BUSINESS_NUMBER debe ser un número de teléfono válido (ej: +5211234567890)",
    )
    .optional(),
});

const supabaseEnvSchema = z.object({
  SUPABASE_URL: z.string().url("SUPABASE_URL debe ser una URL válida"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY es requerido"),
});

const easylexEnvSchema = z.object({
  EASYLEX_ACCESS_KEY_ID: z.string().min(1, "EASYLEX_ACCESS_KEY_ID es requerido"),
  EASYLEX_SECRET_ACCESS_KEY: z.string().min(1, "EASYLEX_SECRET_ACCESS_KEY es requerido"),
  EASYLEX_CALLBACK_URL: z.string().url("EASYLEX_CALLBACK_URL debe ser una URL válida").optional(),
});

/* ─── Types ─── */

export type WhatsAppEnv = z.infer<typeof whatsAppEnvSchema>;
export type SupabaseEnv = z.infer<typeof supabaseEnvSchema>;
export type EasyLexEnv = z.infer<typeof easylexEnvSchema>;

export type EnvValidationResult<T> =
  | { ok: true; env: T }
  | { ok: false; errors: string[] };

/* ─── Validators ─── */

/**
 * Valida las variables de entorno de WhatsApp.
 * Retorna { ok: true, env } o { ok: false, errors }.
 * No lanza excepción — permite manejar la UI de configuración.
 */
export function validateWhatsAppEnv(): EnvValidationResult<WhatsAppEnv> {
  const result = whatsAppEnvSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    logger.warn("env.whatsapp.invalid", { errors });
    return { ok: false, errors };
  }

  return { ok: true, env: result.data };
}

/**
 * Valida las variables de entorno de Supabase.
 * Lanza error si faltan (la app no puede funcionar sin Supabase).
 */
export function validateSupabaseEnv(): SupabaseEnv {
  const result = supabaseEnvSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    const msg = `Variables de entorno de Supabase inválidas:\n${errors.join("\n")}`;
    logger.error("env.supabase.invalid", new Error(msg), { errors });
    throw new Error(msg);
  }

  return result.data;
}

/**
 * Valida las variables de entorno de EasyLex.
 * Retorna { ok: true, env } o { ok: false, errors }.
 */
export function validateEasyLexEnv(): EnvValidationResult<EasyLexEnv> {
  const result = easylexEnvSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    logger.warn("env.easylex.invalid", { errors });
    return { ok: false, errors };
  }

  return { ok: true, env: result.data };
}

/**
 * Acceso tipado a variables de WhatsApp (lazy, sin validación).
 * Para uso en lugares donde ya se asume que están configuradas.
 */
export const whatsAppEnv = {
  get accessToken() { return process.env.WHATSAPP_ACCESS_TOKEN ?? ""; },
  get phoneNumberId() { return process.env.WHATSAPP_PHONE_NUMBER_ID ?? ""; },
  get businessAccountId() { return process.env.WHATSAPP_BUSINESS_ACCOUNT_ID ?? ""; },
  get webhookVerifyToken() { return process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ?? ""; },
  get appSecret() { return process.env.WHATSAPP_APP_SECRET ?? ""; },
  get businessNumber() { return process.env.WHATSAPP_BUSINESS_NUMBER ?? ""; },
  get isConfigured() {
    return Boolean(
      process.env.WHATSAPP_ACCESS_TOKEN &&
      process.env.WHATSAPP_PHONE_NUMBER_ID &&
      process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
    );
  },
};

/**
 * Acceso tipado a variables de EasyLex (lazy, sin validación).
 */
/**
 * Configuración de Google Cloud Tasks para el envío masivo asíncrono.
 *
 * `isConfigured` exige las cuatro variables imprescindibles. Si falta alguna,
 * el sistema usa el driver inline (comportamiento histórico) en vez de fallar:
 * la cola es una mejora opt-in, no un requisito.
 */
export const cloudTasksEnv = {
  get projectId() { return process.env.GCP_PROJECT_ID ?? ""; },
  get location() { return process.env.CLOUD_TASKS_LOCATION ?? "us-central1"; },
  get queue() { return process.env.CLOUD_TASKS_QUEUE ?? "whatsapp-bulk"; },
  /** URL pública del propio servicio; Cloud Tasks hace POST contra ella. */
  get workerBaseUrl() { return process.env.TASKS_WORKER_BASE_URL ?? ""; },
  /** Service account que Cloud Tasks usa para firmar el token OIDC. */
  get invokerServiceAccount() { return process.env.TASKS_INVOKER_SERVICE_ACCOUNT ?? ""; },
  /** Secreto compartido: solo se acepta fuera de producción, para pruebas locales. */
  get workerSecret() { return process.env.TASKS_WORKER_SECRET ?? ""; },
  /** Fuerza un driver concreto: "cloud-tasks" | "inline". Vacío = automático. */
  get driverOverride() { return process.env.QUEUE_DRIVER ?? ""; },
  get isConfigured() {
    return Boolean(
      process.env.GCP_PROJECT_ID &&
      process.env.CLOUD_TASKS_QUEUE &&
      process.env.TASKS_WORKER_BASE_URL &&
      process.env.TASKS_INVOKER_SERVICE_ACCOUNT,
    );
  },
};

export const easylexEnv = {
  get accessKeyId() { return process.env.EASYLEX_ACCESS_KEY_ID ?? ""; },
  get secretAccessKey() { return process.env.EASYLEX_SECRET_ACCESS_KEY ?? ""; },
  get baseUrl() { return process.env.EASYLEX_BASE_URL ?? "https://sandboxapi.easylex.com"; },
  get signingLinkBaseUrl() { return process.env.EASYLEX_SIGNING_LINK_BASE_URL ?? ""; },
  get callbackUrl() { return process.env.EASYLEX_CALLBACK_URL ?? ""; },
  get webhookSecret() { return process.env.EASYLEX_WEBHOOK_SECRET ?? ""; },
  get isConfigured() {
    return Boolean(
      process.env.EASYLEX_ACCESS_KEY_ID &&
      process.env.EASYLEX_SECRET_ACCESS_KEY,
    );
  },
};
