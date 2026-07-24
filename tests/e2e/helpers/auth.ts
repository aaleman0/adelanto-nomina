import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseTestClient } from "./supabase";

/**
 * Sesión autenticada para las pruebas E2E.
 *
 * `src/proxy.ts` protege todo salvo webhooks, health y workers de cola, así que
 * sin sesión las pruebas reciben una redirección a /login donde esperan la
 * respuesta real de la API. Este helper crea un usuario de prueba, inicia
 * sesión y devuelve las cookies que la aplicación espera.
 *
 * Punto clave: **las cookies las genera `@supabase/ssr`, no este archivo**. Se
 * le pasa un adaptador que captura lo que escribe, en vez de reproducir a mano
 * su formato (nombre `sb-<ref>-auth-token`, prefijo `base64-`, troceado en
 * varias cookies si supera el tamaño máximo). Así el helper no se rompe si la
 * librería cambia esos detalles.
 */

export const TEST_USER_EMAIL = "e2e-tests@example.com";

/** Contraseña solo para este usuario de pruebas; no da acceso a nada real. */
const TEST_USER_PASSWORD = "e2e-tests-only-do-not-reuse-9f3a";

export type PlaywrightCookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "Lax" | "Strict" | "None";
};

function getEnv() {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceKey) return null;

  return { origin: new URL(url).origin, anonKey, serviceKey };
}

/**
 * Garantiza que el usuario de pruebas existe y tiene rol `admin`.
 *
 * El rol se fija explícitamente porque las pruebas ejercitan endpoints que
 * exigen `admin`, y porque el perfil podría no existir si todavía no se aplicó
 * la migración que añade el trigger de aprovisionamiento.
 */
async function ensureTestUser(serviceKey: string, origin: string): Promise<string> {
  const admin = createClient(origin, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: TEST_USER_EMAIL,
    password: TEST_USER_PASSWORD,
    email_confirm: true,
  });

  let userId = created?.user?.id ?? null;

  if (createError && !userId) {
    // Ya existía de una corrida anterior: se localiza y se le reasigna la
    // contraseña, por si cambió el valor de este archivo.
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existing = list?.users.find((u) => u.email === TEST_USER_EMAIL);

    if (!existing) {
      throw new Error(
        `No se pudo crear ni encontrar el usuario de pruebas: ${createError.message}`,
      );
    }

    userId = existing.id;
    await admin.auth.admin.updateUserById(userId, { password: TEST_USER_PASSWORD });
  }

  if (!userId) throw new Error("No se pudo determinar el id del usuario de pruebas.");

  const { error: profileError } = await admin
    .from("profiles")
    .upsert({ id: userId, email: TEST_USER_EMAIL, role: "admin" }, { onConflict: "id" });

  if (profileError) {
    throw new Error(`No se pudo asignar el rol admin al usuario de pruebas: ${profileError.message}`);
  }

  return userId;
}

/**
 * Inicia sesión y devuelve las cookies en el formato de Playwright.
 *
 * Devuelve `null` si Supabase no está configurado, para que quien llame pueda
 * decidir si omitir o fallar.
 */
export async function createAuthenticatedCookies(
  baseURL: string,
): Promise<PlaywrightCookie[] | null> {
  // Reutiliza la carga de .env.local del helper existente.
  if (!getSupabaseTestClient()) return null;

  const env = getEnv();
  if (!env) return null;

  await ensureTestUser(env.serviceKey, env.origin);

  const anon = createClient(env.origin, env.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await anon.auth.signInWithPassword({
    email: TEST_USER_EMAIL,
    password: TEST_USER_PASSWORD,
  });

  if (error || !data.session) {
    throw new Error(`No se pudo iniciar sesión con el usuario de pruebas: ${error?.message}`);
  }

  // Adaptador que captura lo que `@supabase/ssr` quiere escribir.
  const captured: Array<{ name: string; value: string }> = [];

  const ssrClient = createServerClient(env.origin, env.anonKey, {
    cookies: {
      getAll: () => [],
      setAll: (cookiesToSet) => {
        for (const cookie of cookiesToSet) {
          captured.push({ name: cookie.name, value: cookie.value });
        }
      },
    },
  });

  await ssrClient.auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });

  if (captured.length === 0) {
    throw new Error("@supabase/ssr no emitió cookies de sesión.");
  }

  const { hostname, protocol } = new URL(baseURL);

  return captured.map((cookie) => ({
    name: cookie.name,
    value: cookie.value,
    domain: hostname,
    path: "/",
    expires: data.session!.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
    httpOnly: false,
    secure: protocol === "https:",
    sameSite: "Lax" as const,
  }));
}
