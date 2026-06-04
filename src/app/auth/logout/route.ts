/**
 * Route Handler: cierre de sesión.
 *
 * Acepta POST para evitar que un link externo pueda desloguear al usuario
 * con un simple GET (CSRF protection básica).
 *
 * Elimina la sesión de Supabase (revoca los tokens en el servidor)
 * y redirige a /login.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createSessionClient } from "@/lib/supabase/session";

export async function POST(request: NextRequest) {
  const supabase = await createSessionClient();
  await supabase.auth.signOut();

  const loginUrl = new URL("/login", request.url);
  return NextResponse.redirect(loginUrl, { status: 303 });
}
