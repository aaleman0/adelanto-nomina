/**
 * Route Handler: callback de OAuth para Supabase.
 *
 * Google redirige aquí tras autenticar al usuario. Este handler:
 * 1. Intercambia el `code` de autorización por una sesión real (access + refresh tokens).
 * 2. Guarda los tokens en cookies httpOnly a través de Supabase SSR.
 * 3. Redirige al usuario a la ruta original o al dashboard.
 *
 * Ruta registrada en Google Console y Supabase como:
 *   {APP_URL}/auth/callback
 */

import { NextResponse, type NextRequest } from "next/server";
import { createSessionClient } from "@/lib/supabase/session";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  // Si no hay code, algo salió mal en el lado de Google/Supabase.
  if (!code) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("Autenticación cancelada o inválida.")}`,
    );
  }

  const supabase = await createSessionClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("No se pudo completar el inicio de sesión. Intenta de nuevo.")}`,
    );
  }

  // Validar que el `next` no sea una URL externa (prevención de open redirect).
  const safeNext = next.startsWith("/") ? next : "/";

  return NextResponse.redirect(`${origin}${safeNext}`);
}
