"use server";

import { redirect } from "next/navigation";
import { createSessionClient } from "@/lib/supabase/session";

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
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=${encodeURIComponent(next)}`,
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
