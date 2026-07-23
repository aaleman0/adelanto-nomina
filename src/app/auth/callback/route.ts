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

/**
 * Allow-list de dominios de correo (opt-in). Si `ALLOWED_EMAIL_DOMAINS` está
 * definida (p. ej. "orbitware.com,ejemplo.mx"), solo se admiten correos de esos
 * dominios; vacía = sin restricción (comportamiento actual). Es defensa en
 * profundidad frente a un OAuth de Supabase permisivo combinado con RBAC en
 * `warn`.
 */
function allowedEmailDomains(): string[] {
  return (process.env.ALLOWED_EMAIL_DOMAINS ?? "")
    .split(",")
    .map((domain) => domain.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
}

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
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("No se pudo completar el inicio de sesión. Intenta de nuevo.")}`,
    );
  }

  // Rechazar dominios no autorizados (si hay allow-list configurada).
  const allowed = allowedEmailDomains();
  if (allowed.length > 0) {
    const email = data.user?.email?.toLowerCase() ?? "";
    const domain = email.includes("@") ? email.slice(email.lastIndexOf("@") + 1) : "";
    if (!allowed.includes(domain)) {
      await supabase.auth.signOut();
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent("Tu cuenta no está autorizada para este backoffice.")}`,
      );
    }
  }

  // Validar que el `next` no sea una URL externa (prevención de open redirect).
  const safeNext = next.startsWith("/") ? next : "/";

  return NextResponse.redirect(`${origin}${safeNext}`);
}
