/**
 * Clientes de Supabase con soporte de sesiones via cookies (SSR).
 *
 * Separados del cliente admin (service_role) para no mezclar
 * autenticación de usuario con operaciones privilegiadas.
 *
 * - `createSessionClient()` → para Server Components y Route Handlers.
 *   Lee y escribe cookies de la request/response actual.
 *
 * - `createBrowserClient()` → para Client Components.
 *   Gestiona la sesión en el navegador con el anon key.
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Normalizar la URL al origen base — el cliente SSR no acepta paths como /rest/v1/
const rawUrl = process.env.SUPABASE_URL ?? "";
const supabaseUrl = rawUrl ? new URL(rawUrl).origin : "";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? "";

/**
 * Cliente Supabase para Server Components y Route Handlers.
 * Requiere `cookies()` de Next.js — solo válido en contexto de servidor.
 *
 * Lanza error descriptivo si faltan las variables de entorno necesarias.
 */
export async function createSessionClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Faltan variables de entorno: SUPABASE_URL y SUPABASE_ANON_KEY son requeridas.\n" +
        "Agrégalas a tu .env.local:\n" +
        "  SUPABASE_ANON_KEY=<tu anon key de Supabase>\n" +
        "  NEXT_PUBLIC_APP_URL=http://localhost:3000",
    );
  }

  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // En Server Components el set no está permitido.
          // El middleware se encarga de refrescar las cookies.
        }
      },
    },
  });
}

/**
 * Obtiene la sesión del usuario autenticado desde un Server Component.
 * Devuelve null si no hay sesión activa.
 */
export async function getSession() {
  const supabase = await createSessionClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
}

/**
 * Obtiene el usuario autenticado con verificación en el servidor de Supabase.
 * Más seguro que getSession() para decisiones de autorización.
 * Devuelve null si no hay sesión activa.
 */
export async function getUser() {
  const supabase = await createSessionClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) return null;
  return user;
}
