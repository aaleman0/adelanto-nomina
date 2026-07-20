import { getSupabaseAdmin } from "./server";
import { createSessionClient } from "./session";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente para LECTURAS del backoffice.
 *
 * Devuelve uno de dos clientes según `RLS_SESSION_READS`, siguiendo el mismo
 * patrón opt-in del resto del proyecto (la cola cae a inline, RBAC arranca en
 * warn):
 *
 * - Apagado (por defecto) → cliente admin (service role). Hace bypass de RLS,
 *   comportamiento idéntico al histórico. Es lo que corre hoy en producción.
 *
 * - `RLS_SESSION_READS=on` → cliente de sesión (anon key + JWT del usuario).
 *   Las consultas quedan sujetas a RLS y devuelven datos según el rol.
 *
 * ORDEN DE ACTIVACIÓN, importante: encender el flag ANTES de aplicar la
 * migración de políticas (20260722) deja al cliente de sesión bajo deny-all y
 * las lecturas devolverían cero filas. La secuencia correcta es: aplicar la
 * migración, verificar, y solo entonces poner el flag en `on`.
 *
 * SOLO LECTURAS. Las escrituras siguen yendo por el cliente admin explícito:
 * webhooks, acciones y jobs no dependen de una sesión de navegador.
 */
export function isSessionReadsEnabled(): boolean {
  return process.env.RLS_SESSION_READS === "on";
}

export async function getReadClient(): Promise<SupabaseClient> {
  if (isSessionReadsEnabled()) {
    return createSessionClient();
  }
  return getSupabaseAdmin();
}
