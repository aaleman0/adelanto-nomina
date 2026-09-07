"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createSessionClient } from "@/lib/supabase/session";

function isPublicHost(host: string | null): boolean {
  if (!host) return false;
  // Ignorar hosts internos o IPs, que no sirven para redirigir un navegador.
  if (/^(0\.0\.0\.0|127\.0\.0\.1|localhost|::1)/i.test(host)) return false;
  // En Railway el host público siempre tiene al menos un punto y un TLD.
  return host.includes(".");
}

async function getAppOrigin() {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const forwardedHost = h.get("x-forwarded-host");
  const host = h.get("host");

  if (isPublicHost(forwardedHost)) return `${proto}://${forwardedHost}`;
  if (isPublicHost(host)) return `${proto}://${host}`;

  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

/**
 * Server Action: inicia el flujo OAuth con Google.
 *
 * Genera la URL de autorización de Supabase/Google y redirige al usuario.
 * El `next` viene del campo oculto del form para volver a la ruta original
 * tras el login.
 */
export async function signInWithGoogle(formData: FormData) {
  const next = (formData.get("next") as string | null) ?? "/";
  const supabase = await createSessionClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      // Callback interno que Supabase llama tras autenticar con Google.
      // Usa el host de la petición para no depender de NEXT_PUBLIC_APP_URL embebido.
      redirectTo: `${await getAppOrigin()}/auth/callback?next=${encodeURIComponent(next)}`,
      // Forzar la pantalla de selección de cuenta de Google en cada login.
      queryParams: { prompt: "select_account" },
    },
  });

  if (error || !data.url) {
    redirect(
      `/login?error=${encodeURIComponent("No se pudo iniciar la autenticación con Google. Intenta de nuevo.")}`,
    );
  }

  redirect(data.url);
}
