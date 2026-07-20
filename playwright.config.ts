import { defineConfig, devices } from "@playwright/test";
import { STORAGE_STATE } from "./tests/e2e/storage-state";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    // `retries: 0` haría que "on-first-retry" no capturara nunca nada.
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 60_000,
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
