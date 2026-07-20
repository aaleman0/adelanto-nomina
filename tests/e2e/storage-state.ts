import { resolve } from "node:path";

/**
 * Estado de sesión compartido entre el proyecto `setup` y las pruebas.
 *
 * Vive en un módulo aparte para que tanto `playwright.config.ts` como
 * `auth.setup.ts` usen la misma ruta sin importarse entre sí.
 *
 * El archivo contiene un token de sesión real: está en .gitignore.
 */
export const STORAGE_STATE = resolve(process.cwd(), "tests/e2e/.auth/state.json");
