import { test as setup, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createAuthenticatedCookies } from "./helpers/auth";
import { STORAGE_STATE } from "./storage-state";

/**
 * Prepara la sesión que compartirán todas las pruebas.
 *
 * Se ejecuta una vez, antes del resto, como proyecto `setup` del que dependen
 * los demás. Deja el estado en disco para que tanto el navegador como el
 * fixture `request` lo reutilicen.
 */
setup("autenticar usuario de pruebas", async ({ baseURL }) => {
  const cookies = await createAuthenticatedCookies(baseURL ?? "http://localhost:3000");

  if (!cookies) {
    // Sin credenciales no hay forma de autenticarse. Se falla en voz alta en
    // lugar de dejar un estado vacío: con storageState vacío las pruebas
    // fallarían más adelante con un 404 desconcertante en vez de explicar la
    // causa real.
    throw new Error(
      "Supabase no está configurado (SUPABASE_URL, SUPABASE_ANON_KEY, " +
        "SUPABASE_SERVICE_ROLE_KEY en .env.local). Las pruebas E2E necesitan " +
        "una sesión real porque src/proxy.ts protege toda la aplicación.",
    );
  }

  expect(cookies.length).toBeGreaterThan(0);

  mkdirSync(dirname(STORAGE_STATE), { recursive: true });
  writeFileSync(STORAGE_STATE, JSON.stringify({ cookies, origins: [] }, null, 2));
});
