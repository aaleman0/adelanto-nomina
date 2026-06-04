/**
 * Cliente de Supabase para uso en middleware de Next.js.
 *
 * El middleware no puede usar `cookies()` de next/headers porque
 * opera sobre el objeto NextRequest/NextResponse directamente.
 * Este helper encapsula esa diferencia.
 */

import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";

// Normalizar la URL al origen base — el cliente SSR no acepta paths como /rest/v1/
const rawUrl = process.env.SUPABASE_URL ?? "";
const supabaseUrl = rawUrl ? new URL(rawUrl).origin : "";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? "";

/**
 * Crea un cliente Supabase compatible con el middleware de Next.js.
 * Devuelve el cliente y la respuesta con las cookies actualizadas.
 */
export function createMiddlewareClient(request: NextRequest, response: NextResponse) {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Faltan variables de entorno: SUPABASE_URL y SUPABASE_ANON_KEY son requeridas para la autenticación.",
    );
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  return { supabase, response };
}
