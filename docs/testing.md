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

# Invariante de RLS contra la base real (fuera de la suite unitaria normal)
pnpm verify:rls        # = RUN_RLS_CHECK=1 vitest run src/lib/security/rls-invariant.test.ts
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

### Cobertura actual

> Nota: el conteo exacto crece con cada cambio (al 2026-09-25, 40 archivos y 434
> tests unitarios, de los que 20 se saltan por defecto: son los de
> `rls-invariant.test.ts`, que solo corren con `RUN_RLS_CHECK=1`). La tabla de
> abajo resume las áreas cubiertas, no un total fijo.

| Archivo | Qué cubre |
|---|---|
| `src/lib/security/webhook-signatures.test.ts` | HMAC de Meta (firma válida, secreto distinto, cuerpo alterado, cabecera ausente, prefijo mal formado, secreto vacío, JSON reserializado), comparación en tiempo constante, y el webhook de EasyLex por sus dos esquemas: secreto compartido plano y HMAC-SHA256 del cuerpo (hex crudo o con prefijo `sha256=`), rechazando secreto distinto, cuerpo alterado y cabecera vacía |
| `src/lib/whatsapp/schemas.test.ts` | Los esquemas Zod de todos los endpoints validados: modos, UUIDs, límites de paginación, fechas no parseables, normalización de teléfono |
| `src/lib/whatsapp/eligibility.test.ts` | `validateEligibility`: todas las condiciones cumplidas, sin oferta, oferta no elegible, oferta `rechazada`, oferta `solicitada`, oferta `firmada`, sin cuenta bancaria. `getEmployeesEligibility`: array vacío y varios empleados |
| `src/lib/contracts/request-contract.test.ts` | `parseRequestContractPayload`: alias snake/camelCase, RFC insensible a mayúsculas, faltantes que lanzan, normalización de teléfono mexicano, prefijo `52` ya presente, opcionales nulos, paso de `rawPayload` |
| `src/lib/whatsapp/phone-utils.test.ts` | Móvil local → `521`, `52` → `521`, `521` sin cambios, internacional no mexicano intacto, `52` clasificado como `long_distance` |
| `src/lib/easylex/monto-en-letra.test.ts` | Montos enteros, con centavos, superiores al millón, y redondeo a dos decimales |
| `src/lib/security/rate-limit.test.ts` | Ventana fija: permite hasta el límite y bloquea, cuota independiente por identificador y por limitador, reinicio al expirar, `retryAfterSeconds`; extracción de IP de `x-forwarded-for`/`x-real-ip` y agrupación `unknown` |
| `src/lib/imports/csv.test.ts` | `prepareCsvImport`: alias de encabezado, columnas ausentes, validación de RFC/CLABE/teléfono, normalización de monto y fecha, elegibilidad y monto condicional, duplicados dentro del archivo, aviso de CURP, hash de fila |
| `src/lib/imports/apply.test.ts` | Funciones puras de `applyImportBatch`: `hasEmployeeChanged` (detección campo a campo, `?? null` vs `\|\| null`), `buildOfferPayload` (elegibilidad → estado, monto por defecto, idempotencia), `requireString` |
| `src/lib/observability/observability.test.ts` | `captureException` reenvía al manejador y no propaga fallos; `logger.error`/`critical` reportan y `logger.info` no; lectura de configuración desde entorno. Usa `vi.importActual` para el logger real, porque el setup lo mockea |
| `src/lib/contracts/ventana-oferta.test.ts` | La ventana para PEDIR, con reloj fijo: sin envío de la empresa no se puede pedir, el anclaje en la entrega para el teléfono sin señal, el tope de entrega tardía, fechas en el futuro e ilegibles, `pasoAlPedir` para `firmada`/`solicitada`, que solo cuente el `bulk_contract_offer` que Meta aceptó y solo de esa persona, que el enlace de la propia solicitud no reabra la ventana, y el cierre ante fallo de base. **Incluye las dos pruebas que leen el código fuente para impedir que la ventana y el TTL del enlace se vuelvan a derivar uno del otro** |
| `src/lib/contracts/solicitud-previa.test.ts` | `evaluarSolicitudPrevia`: a quien ya pidió se le entrega el enlace que tiene, y nunca se le promete uno vencido o a punto de vencer (`MARGEN_PARA_REUSAR_MS`) |
| `src/lib/contracts/firma-tardia.test.ts` | `queHacerConLaFirma`: una solicitud en curso se registra, una `reemplazada` solo deja evidencia y no revive, y un estado desconocido cae del lado seguro (lista blanca, no negra) |
| `src/lib/contracts/link-expiry.test.ts` | `estaVencido`: dentro del plazo deja firmar, fuera no, el segundo del vencimiento cierra, y sin fecha o con fecha ilegible tampoco deja |
| `src/lib/whatsapp/chatbot.test.ts` y `chatbot-ventana.test.ts` | El chatbot completo y su paso por la ventana: antigüedad del mensaje, respuesta de un ciclo anterior, el "Sí" pasando por la ventana antes de generar contrato, y quien ya pidió |
| `src/lib/whatsapp/respuestas.test.ts` | `resumirRespuesta`: qué contestó la persona tal como lo lee el operador, incluidas las respuestas automáticas sin texto a la vista |
| `src/lib/security/rls-invariant.test.ts` | Que con la anon key ninguna de las 18 tablas ni las vistas de backoffice devuelvan filas. **Golpea la base real: se salta salvo con `RUN_RLS_CHECK=1`** (ver `pnpm verify:rls`) |

### Huecos

Ya hay **un** test de componente: `src/app/solicitar/[token]/page.test.tsx` pinta la pantalla del empleado llamando al componente de servidor y serializando su árbol con `renderToStaticMarkup`, sin navegador. Testing Library y `msw` siguen instalados y sin usar; el día que haya componentes de cliente que probar, ahí están. Falta cobertura unitaria de `src/lib/backoffice/`, `src/lib/google/` y los route handlers.

De `src/lib/imports/` ya se cubre la parte pura (`csv.ts` completo y las funciones de decisión de `apply.ts`). Lo que queda de `apply.ts` está acoplado a Supabase —upserts, versionado de ofertas, paginación— y solo se valida por E2E; probarlo requeriría un mock del cliente o una base de prueba aislada.

## Playwright

Configuración: `testDir: ./tests/e2e`, timeout 60 s (expect 15 s), `fullyParallel: false`, `retries: 1`, reporter `list`, `baseURL: http://localhost:3000`, y dos proyectos: `setup` (crea la sesión) y `chromium` / Desktop Chrome, que depende de él. El `webServer` levanta `pnpm dev` con `reuseExistingServer: true`, 120 s de arranque y `ENABLE_MOCK_SIGN: "true"` en el entorno.

> `trace: "retain-on-failure"`: la traza se conserva cuando el caso acaba en fallo, reintento incluido. No hay que tocar nada para obtenerla.

### Estructura

| Compartimento | Archivos | Alcance |
|---|---|---|
| `smoke/` | 1 (3 tests) | La portada y el control de contratos cargan, y la navegación principal está disponible |
| `api/` | 6 (48 tests) | Endpoints aislados, sin abrir página |
| `flows/` | 7 (46 tests) | Recorridos que cruzan API, Supabase y backoffice |

**`api/`** cubre: validación de payload de `whatsapp/bulk` (modo faltante o inválido, `import` sin `importId`, `manual` sin `employeeIds`), paginación y filtros de `bulk/history` con tope de 100 en `pageSize`, `bulk/detail` (400 sin id, 404 desconocido), forma de la respuesta de `whatsapp/config`, verificación del webhook de Meta (válida, sin parámetros, modo incorrecto) y sus estados de entrega, `request-contract` (faltantes, `not_found`, `not_eligible`, generación, idempotencia al repetir RFC, TTL de ~24 h, persistencia), acciones de backoffice (`regenerate-link`, `retry`, `already_signed`, `link_reused`), el webhook de firma simulada `easylex/mock-sign` (payload sin identificador, intento inexistente) y forma de las respuestas de `stats`, `templates` y los health checks.

**`flows/`** incluye `whatsapp-bulk-send` (el mayor, 304 líneas y 16 casos) y `whatsapp-send-flow` (279 líneas, 8 casos: el asistente guiado de 4 pasos —Destinatarios, Mensaje, Revisión, Confirmación— por los modos Importación y Manual, sin pulsar nunca el envío), más `backoffice-actions`, `dashboard-to-contract-detail`, `imports`, `backoffice-statuses` y `contract-filters`. La UI que este párrafo describía —pestañas Import/Manual, barra de acciones adhesiva, tabla de empleados, modal de confirmación— ya no existe; el encabezado del propio archivo lo dice.

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

### Servidor de pruebas: dev, con timeouts holgados y un reintento

La suite corre contra `pnpm dev`, no contra el build de producción. Es a propósito: la suite `api` depende del comportamiento de **desarrollo** —`mock-sign` habilitado y el webhook laxo cuando no hay `WHATSAPP_APP_SECRET`—, que en producción se endurece adrede (404 y 401 respectivamente).

Ojo con `mock-sign`: no basta con no estar en producción, exige además `ENABLE_MOCK_SIGN="true"` (doble cerrojo). El `webServer` de Playwright lo inyecta, pero con `reuseExistingServer: true` un `pnpm dev` que ya estuviera corriendo sin el flag responde 404 y esos casos fallan; hay que reiniciarlo.

El coste de correr contra dev es que Turbopack compila cada ruta en el primer acceso, y esos segundos causaban timeouts intermitentes (la suite se veía flaky sin serlo). Se absorbe con `timeout: 60s`, `expect.timeout: 15s` y `retries: 1`: al reintentar, la ruta ya está compilada y responde al instante. El reintento no enmascara bugs reales —esos también fallan al reintentar— solo el arranque en frío.

### Estado actual

**No hay corrida válida de `smoke` ni de `flows`: navegan a rutas que ya no existen.** El backoffice se reconstruyó entero bajo `src/app/(operacion)/` y la navegación es hoy `/` (Pendientes), `/nomina`, `/ofertas`, `/personas` y `/ajustes`. Las dos suites de UI van a `/contracts`, `/imports`, `/settings/whatsapp`, `/whatsapp`, `/whatsapp/send` y `/whatsapp/history` —ninguna se sirve— y hasta el único destino que sobrevive, `/`, cambió de contenido: su encabezado es "Pendientes", no "Operación", y ya no hay "Embudo de conversión" ni "Requieren acción". Cualquier número de "pasan" escrito aquí sería falso hasta reescribirlas contra el tablero actual.

| Suite | Archivos | Tests | Estado |
|---|---|---|---|
| `smoke` | 1 | 3 | Rota: `/contracts` y los enlaces a `/imports` y `/settings` ya no existen |
| `api` | 6 | 48 | Vigente: todos los endpoints que toca siguen sirviéndose |
| `flows` | 7 | 46 | Rota: toda la UI que recorre desapareció |

De `api`, lo único que depende del entorno son los casos que generan contrato: pasan por Google Docs y sus credenciales son archivos (`google_oauth_client.json` y `token.json` en la raíz, ambos en `.gitignore`, así que un clon nuevo no los trae). Sin ellos esos casos fallan por entorno, no por código. Ver [EasyLex y contratos](easylex-contratos.md#generación-del-pdf).

Y no es un solo caso el que se omite: `flows` tiene veinte llamadas a `test.skip` por falta de Supabase o de contrato elegible. Al reescribir hay que contar los tests **ejecutados**, no los que no fallaron.

### Advertencias operativas

1. **Sin Supabase configurado, parte de la suite se salta silenciosamente.** Varios tests llaman `test.skip(true, …)` cuando no encuentran datos. Antes de dar por buena una corrida, revisar el número de tests *ejecutados*, no solo la ausencia de fallos.

2. **Los tests escriben en la base real.** No hay base de datos de prueba separada: las fixtures crean empleados, ofertas y contratos —y ahora también un usuario— en la misma instancia de Supabase que usa el desarrollo. No apuntar la suite a producción.

3. **La suite E2E no está en CI.** El pipeline corre lint, tipos, tests unitarios, build, escaneo de secretos, auditoría de dependencias y —solo si el repositorio tiene configurado `SUPABASE_PROJECT_ID`— la comprobación de deriva de los tipos de base. Meter E2E en CI requiere levantar Supabase de prueba y montar las credenciales de Google; y antes de eso, reescribir `smoke` y `flows`, que apuntan a rutas que el front nuevo ya no sirve.

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
