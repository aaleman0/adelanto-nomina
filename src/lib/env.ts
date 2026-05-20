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

/* ─── Types ─── */

export type WhatsAppEnv = z.infer<typeof whatsAppEnvSchema>;
export type SupabaseEnv = z.infer<typeof supabaseEnvSchema>;

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
 * Acceso tipado a variables de WhatsApp (lazy, sin validación).
 * Para uso en lugares donde ya se asume que están configuradas.
 */
export const whatsAppEnv = {
  get accessToken() { return process.env.WHATSAPP_ACCESS_TOKEN ?? ""; },
  get phoneNumberId() { return process.env.WHATSAPP_PHONE_NUMBER_ID ?? ""; },
  get webhookVerifyToken() { return process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ?? ""; },
  get appSecret() { return process.env.WHATSAPP_APP_SECRET ?? ""; },
  get businessNumber() { return process.env.WHATSAPP_BUSINESS_NUMBER ?? ""; },
  get isConfigured() {
    return Boolean(
      process.env.WHATSAPP_ACCESS_TOKEN &&
      process.env.WHATSAPP_PHONE_NUMBER_ID,
    );
  },
};
