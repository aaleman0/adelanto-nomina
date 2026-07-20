# Testing

Dos suites independientes: **Vitest** para unidad (`src/**`) y **Playwright** para E2E (`tests/e2e/**`). No se solapan: `vitest.config.ts` limita el `include` a `src/**/*.{test,spec}.{ts,tsx}`, así que nunca recoge los tests de Playwright.

## Comandos

```bash
# Validación estática
pnpm lint
pnpm typecheck
pnpm build

# Unidad
pnpm test              # modo watch
pnpm test:unit         # una sola pasada (el que usa CI)
pnpm test:ui
pnpm test:coverage

# E2E
pnpm test:e2e          # todo
pnpm test:e2e:smoke    # rápido, sin datos
pnpm test:e2e:api      # endpoints
pnpm test:e2e:flows    # recorridos completos
```

`pnpm test` corre en **modo watch**; `pnpm test:unit` hace una sola pasada y es el que usa CI.

### Dos configuraciones de TypeScript

| Archivo | Cubre | Lo usa |
|---|---|---|
| `tsconfig.json` | Solo `src/` y los archivos de config de la raíz | `next build` |
| `tsconfig.check.json` | Lo anterior más `tests/` y `scripts/` | `pnpm typecheck` y CI |

La separación existe para que el build de Next no arrastre los tipos de Playwright y de los scripts. El chequeo completo sigue cubriendo todo, solo que en un paso aparte.

### Memoria del build

`pnpm build` fija `NODE_OPTIONS=--max-old-space-size=4096`. Con el heap por defecto de Node (~2 GB), el paso interno de TypeScript de `next build` agota memoria de forma intermitente y el worker muere con `SIGABRT`. Si aparece `Ineffective mark-compacts near heap limit` en un entorno nuevo, es esto: hay que subir el límite, no es un error de código.

## Vitest

Configuración: `@vitejs/plugin-react-swc`, entorno `jsdom`, `globals: true`, setup en `src/test/setup.ts`, cobertura v8 con reporters `text` y `html`, alias `@` → `./src`.

`src/test/setup.ts` importa `@testing-library/jest-dom` y **mockea globalmente** `@/lib/logger` y `@/lib/supabase/server` (`getSupabaseAdmin`). Es decir, ningún test unitario toca la base de datos.

### Cobertura actual — 6 archivos, 76 tests

| Archivo | Qué cubre |
|---|---|
| `src/lib/security/webhook-signatures.test.ts` | HMAC de Meta (firma válida, secreto distinto, cuerpo alterado, cabecera ausente, prefijo mal formado, secreto vacío, JSON reserializado) y comparación en tiempo constante |
| `src/lib/whatsapp/schemas.test.ts` | Los esquemas Zod de todos los endpoints validados: modos, UUIDs, límites de paginación, fechas no parseables, normalización de teléfono |
| `src/lib/whatsapp/eligibility.test.ts` | `validateEligibility`: todas las condiciones cumplidas, sin oferta, oferta no elegible, oferta `rechazada`, oferta `solicitada`, oferta `firmada`, sin cuenta bancaria. `getEmployeesEligibility`: array vacío y varios empleados |
| `src/lib/contracts/request-contract.test.ts` | `parseRequestContractPayload`: alias snake/camelCase, RFC insensible a mayúsculas, faltantes que lanzan, normalización de teléfono mexicano, prefijo `52` ya presente, opcionales nulos, paso de `rawPayload` |
| `src/lib/whatsapp/phone-utils.test.ts` | Móvil local → `521`, `52` → `521`, `521` sin cambios, internacional no mexicano intacto, `52` clasificado como `long_distance` |
| `src/lib/easylex/monto-en-letra.test.ts` | Montos enteros, con centavos, superiores al millón, y redondeo a dos decimales |
| `src/lib/security/rate-limit.test.ts` | Ventana fija: permite hasta el límite y bloquea, cuota independiente por identificador y por limitador, reinicio al expirar, `retryAfterSeconds`; extracción de IP de `x-forwarded-for`/`x-real-ip` y agrupación `unknown` |
| `src/lib/imports/csv.test.ts` | `prepareCsvImport`: alias de encabezado, columnas ausentes, validación de RFC/CLABE/teléfono, normalización de monto y fecha, elegibilidad y monto condicional, duplicados dentro del archivo, aviso de CURP, hash de fila |
| `src/lib/imports/apply.test.ts` | Funciones puras de `applyImportBatch`: `hasEmployeeChanged` (detección campo a campo, `?? null` vs `\|\| null`), `buildOfferPayload` (elegibilidad → estado, monto por defecto, idempotencia), `requireString` |
| `src/lib/observability/observability.test.ts` | `captureException` reenvía al manejador y no propaga fallos; `logger.error`/`critical` reportan y `logger.info` no; lectura de configuración desde entorno. Usa `vi.importActual` para el logger real, porque el setup lo mockea |

### Huecos

Están instalados `jsdom`, Testing Library y `msw`, pero **no hay ni un test de componente**. Falta cobertura unitaria de `src/lib/backoffice/`, `src/lib/google/` y los route handlers.

De `src/lib/imports/` ya se cubre la parte pura (`csv.ts` completo y las funciones de decisión de `apply.ts`). Lo que queda de `apply.ts` está acoplado a Supabase —upserts, versionado de ofertas, paginación— y solo se valida por E2E; probarlo requeriría un mock del cliente o una base de prueba aislada.

## Playwright

Configuración: `testDir: ./tests/e2e`, timeout 30 s (expect 10 s), `fullyParallel: false`, `retries: 0`, reporter `list`, `baseURL: http://localhost:3000`, un solo proyecto (`chromium` / Desktop Chrome). El `webServer` levanta `pnpm dev` con `reuseExistingServer: true` y 60 s de arranque.

> `trace: "on-first-retry"` no tiene efecto porque `retries: 0`. Para obtener trazas, subir `retries` o cambiarlo a `"on"`.

### Estructura

| Compartimento | Archivos | Alcance |
|---|---|---|
| `smoke/` | 1 (2 tests) | El dashboard y el control de contratos cargan |
| `api/` | 5 (~45 tests) | Endpoints aislados, sin abrir página |
| `flows/` | 7 (~40 tests) | Recorridos que cruzan API, Supabase y backoffice |

**`api/`** cubre: validación de payload de `whatsapp/bulk` (modo faltante o inválido, `import` sin `importId`, `manual` sin `employeeIds`), paginación y filtros de `bulk/history` con tope de 100 en `pageSize`, `bulk/detail` (400 sin id, 404 desconocido), verificación del webhook de Meta (válida, sin parámetros, modo incorrecto) y sus estados de entrega, `request-contract` (faltantes, `not_found`, `not_eligible`, generación, idempotencia al repetir RFC, TTL de ~2 h, persistencia), acciones de backoffice (`regenerate-link`, `retry`, `already_signed`, `link_reused`) y forma de las respuestas de `stats`, `templates` y los health checks.

**`flows/`** incluye `whatsapp-send-flow.flow` (el mayor, 578 líneas: pestañas Import/Manual, plantilla editable, barra de acciones adhesiva, tabla de empleados, modal de confirmación, pantalla de resultado), más `whatsapp-bulk-send`, `backoffice-actions`, `dashboard-to-contract-detail`, `imports`, `backoffice-statuses` y `contract-filters`.

### Helpers

- `tests/e2e/helpers/supabase.ts` — parsea `.env.local` a mano (salta comentarios, quita comillas, **no pisa variables ya presentes**), construye el cliente con `new URL(SUPABASE_URL).origin` (porque `SUPABASE_URL` trae el sufijo `/rest/v1/`), y devuelve `null` si no hay configuración. Expone `findEligibleContractFixture()`.
- `tests/e2e/helpers/contract-fixtures.ts` — `createEmployeeFixture`, `createOfferFixture`, `createEmployeeWithOfferFixture`, `expireContractAttempt`, `createBackofficeStatusFixture`, contadores y lectores de estado, y el tipo `ContractState`.

### Autenticación de las pruebas

`src/proxy.ts` protege toda la aplicación, así que **sin sesión las pruebas reciben una redirección a `/login`** donde esperan la respuesta real. Se resuelve con un proyecto `setup` de Playwright que corre antes que el resto:

```
tests/e2e/auth.setup.ts        crea la sesión y la guarda
tests/e2e/helpers/auth.ts      usuario de prueba + cookies
tests/e2e/.auth/state.json     storageState (en .gitignore)
```

El helper crea el usuario `e2e-tests@example.com` con la admin API, le asigna rol `admin`, inicia sesión y **deja que `@supabase/ssr` genere las cookies**, pasándole un adaptador que captura lo que escribe. No se reproduce a mano el formato (`sb-<ref>-auth-token`, prefijo `base64-`, troceado): así el helper no se rompe si la librería lo cambia.

El `storageState` lo usan tanto el navegador como el fixture `request`, de modo que las pruebas de API también viajan autenticadas.

Si Supabase no está configurado, el setup **falla en voz alta** explicando por qué, en lugar de dejar que las pruebas fallen después con un 404 desconcertante.

Las pruebas del webhook de Meta firman su payload con `WHATSAPP_APP_SECRET` (`helpers/meta-signature.ts`), porque desde el endurecimiento de seguridad un payload sin firma recibe `401`.

### Estado actual

| Suite | Pasan | Fallan | Causa de los fallos |
|---|---|---|---|
| `smoke` | 3 | 0 | — |
| `api` | 43 | 6 | Falta `google_oauth_client.json`: no se puede generar ningún contrato |
| `flows` | 8 | 37 | Prueban una versión anterior de la UI |

Los 6 de `api` son de entorno, no de código: la generación de contratos pasa por Google Docs y sus credenciales son archivos que no están presentes. Ver [EasyLex y contratos](easylex-contratos.md#generación-del-pdf).

Los 37 de `flows` prueban el formulario de envío anterior (pestañas, barra adhesiva) que fue sustituido por el asistente de 5 pasos. **Están pendientes de reescribir** contra la UI actual.

### Advertencias operativas

1. **Sin Supabase configurado, parte de la suite se salta silenciosamente.** Varios tests llaman `test.skip(true, …)` cuando no encuentran datos. Antes de dar por buena una corrida, revisar el número de tests *ejecutados*, no solo la ausencia de fallos.

2. **Los tests escriben en la base real.** No hay base de datos de prueba separada: las fixtures crean empleados, ofertas y contratos —y ahora también un usuario— en la misma instancia de Supabase que usa el desarrollo. No apuntar la suite a producción.

3. **La suite E2E no está en CI.** El pipeline corre lint, tipos, tests unitarios, build, escaneo de secretos y auditoría. Añadir E2E requiere antes reescribir `flows` y resolver las credenciales de Google.

## Flujo recomendado

1. `pnpm lint` y `pnpm exec tsc --noEmit`.
2. `pnpm exec vitest run`.
3. `pnpm test:e2e:smoke` para verificar que la app levanta.
4. `pnpm test:e2e:api` al tocar endpoints.
5. `pnpm test:e2e:flows` antes de cerrar un bloque de trabajo.
6. `pnpm build` antes de desplegar.

Al escribir un test funcional, validar **dos capas**: que la API responde lo esperado y que Supabase o el backoffice reflejan el estado resultante. Un test que solo comprueba el código HTTP no detecta que el estado no cambió.

Verificar idempotencia cuando aplique: repetir la solicitud del mismo contrato no debe crear una segunda solicitud activa.

No imprimir `.env.local`, la service role key ni payloads sensibles completos en la salida de los tests.

Ver también: [API](api.md) · [Base de datos](base-de-datos.md)
