import { defineConfig, devices } from "@playwright/test";
import { STORAGE_STATE } from "./tests/e2e/storage-state";

export default defineConfig({
  testDir: "./tests/e2e",
  // Timeouts holgados: el servidor de desarrollo (pnpm dev) compila cada ruta en
  // el primer acceso (Turbopack on-demand) y esos segundos causaban timeouts
  // intermitentes. Se corre contra dev —no producción— porque la suite `api`
  // depende del comportamiento de desarrollo (mock-sign habilitado, webhook
  // laxo sin secreto); en producción esas rutas se endurecen a propósito.
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  // Un reintento absorbe el arranque en frío de una ruta sin compilar: al
  // reintentar la ruta ya está compilada y responde al instante. No enmascara
  // bugs reales (un fallo real también falla en el reintento).
  retries: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    {
      // Crea la sesión compartida. Debe correr antes que el resto: la
      // aplicación está protegida por `src/proxy.ts` y sin sesión toda petición
      // acaba redirigida a /login.
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Lo usan tanto el navegador como el fixture `request`, así que las
        // pruebas de API también viajan autenticadas.
        storageState: STORAGE_STATE,
      },
      dependencies: ["setup"],
    },
  ],
});
