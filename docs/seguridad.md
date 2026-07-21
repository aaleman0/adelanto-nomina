# Seguridad

Este documento reúne los cinco pilares de seguridad del backoffice —**autenticación, autorización, rate limiting, Row-Level Security y validación server-side**— con los casos comunes de cada uno, cómo se resuelven hoy, y un [plan de endurecimiento](#plan-de-endurecimiento) con los huecos reales pendientes.

El backoffice es interno (equipo de operaciones) pero maneja datos sensibles: PII, RFC/CURP y cuentas bancarias (CLABE). El diseño sigue **defensa en profundidad**: ningún control es el único que protege un dato.

Estado a 2026-07-21, verificado contra el código y contra la base en vivo.

---

## 1. Autenticación

**Quién es el usuario, y que la sesión sea auténtica en cada request.**

| Caso común | Cómo se resuelve | Estado |
|---|---|---|
| Inicio de sesión | OAuth con Google (Authorization Code + PKCE, vía `@supabase/ssr`). Los tokens viven en cookies, nunca en la URL. `src/app/login/actions.ts`, `src/app/auth/callback/route.ts` | ✅ |
| Verificación en cada request | `src/proxy.ts` (convención de middleware de Next 16) corre en todas las rutas y llama `supabase.auth.getUser()` — verificación **autoritativa** contra el servidor de Auth, no un decode local. Refresca el token de forma transparente | ✅ |
| Acceso sin sesión | Redirige a `/login?next=…` (fail-closed). Las rutas privilegiadas además devuelven `401` vía `requireRole()` | ✅ |
| Open-redirect en `next` | El callback exige que `next` empiece por `/` (`safeNext`), así que no se puede redirigir a un dominio externo | ✅ |
| Webhook de Meta (público) | Firma HMAC-SHA256 de `X-Hub-Signature-256` sobre el cuerpo crudo, comparada en tiempo constante. `src/lib/security/webhook-signatures.ts` | ✅ |
| Webhook de EasyLex (público) | Secreto compartido `x-easylex-signature`, comparado en tiempo constante | ✅ |
| Worker de Cloud Tasks (público) | Token OIDC firmado por Google: valida firma, `audience` y `email_verified`. `src/lib/security/cloud-tasks-auth.ts` | ⚠️ parcial — ver plan |
| Firma simulada (`mock-sign`) | Responde `404` en producción (oculta su existencia); solo operativa fuera de producción | ✅ |

**Fail-closed en producción.** Si falta `WHATSAPP_APP_SECRET` o `EASYLEX_WEBHOOK_SECRET`, en producción los webhooks **rechazan todo** (`401`); el modo laxo solo aplica fuera de producción, con log de advertencia. Todo esto depende de un único predicado `NODE_ENV === "production"`.

---

## 2. Autorización (RBAC)

**Qué puede hacer cada usuario.** Roles acumulativos: `solo_lectura` < `operaciones` < `admin`.

| Caso común | Cómo se resuelve | Estado |
|---|---|---|
| Rol mínimo por endpoint | `requireRole(min)` al inicio del handler. `src/lib/auth/roles.ts`. Reparto en [API](api.md#autorización-por-rol) | ⚠️ una excepción — ver plan |
| Server actions | Comprueban el rol por su cuenta (no pasan por el proxy). `src/app/contracts/actions.ts` | ✅ |
| UI por rol | `RoleGate` / `useHasRole` ocultan o deshabilitan controles. **Es solo UX**: la barrera real es el servidor | ✅ |
| Rutas admin-only | Guard de servidor que redirige a quien no sea admin, no solo ocultar el enlace. `src/app/settings/layout.tsx` | ✅ |
| Default-deny | Todo perfil nace `solo_lectura`; nadie escribe hasta ser promovido | ✅ |
| Primer admin | `BOOTSTRAP_ADMIN_EMAILS` promueve al iniciar sesión | ✅ |

**Modo `warn` por defecto** (`RBAC_ENFORCEMENT`). Los roles se comprueban y registran, pero **no bloquean** hasta poner `enforce`. Es deliberado —todos nacen `solo_lectura`, activar `enforce` sin promover a nadie dejaría la app sin operadores— pero mientras siga en `warn` la autorización es efectivamente binaria (hay sesión o no). La UI sí refleja el rol siempre.

---

## 3. Rate limiting

**Frenar el abuso de los endpoints públicos y de las escrituras caras.**

| Caso común | Cómo se resuelve | Estado |
|---|---|---|
| Endpoints limitados | Webhooks (WhatsApp, EasyLex), envío masivo, subida de CSV, acciones admin de WhatsApp, y el lote de backoffice | ⚠️ faltan algunos — ver plan |
| Algoritmo | Ventana fija en memoria (`src/lib/security/rate-limit.ts`). Clave por IP + nombre de limitador | ✅ |
| Respuesta al exceder | `429` con `Retry-After` y cabeceras `X-RateLimit-*` | ✅ |
| Orden en webhooks | Se limita **antes** de verificar la firma, para que el bombardeo no llegue ni a la verificación HMAC | ✅ |

**Límite en memoria, por instancia.** El estado no se comparte entre réplicas: con N instancias el límite efectivo es N× el configurado. Frena el abuso trivial, no un atacante distribuido. Para un límite global exacto habría que mover el store a Redis conservando la misma interfaz.

---

## 4. Row-Level Security (RLS)

**Que la base misma limite qué filas ve cada quien, no solo la aplicación.**

Estado en la base a 2026-07-21: **RLS activa y verificada.** La `anon key` pública devuelve **0 filas** en las 18 tablas (comprobado en vivo).

| Caso común | Cómo se resuelve | Estado |
|---|---|---|
| Fuga por la anon key | Fase A: deny-all en las 18 tablas (`20260720`). La anon key pública ya no lee nada | ✅ aplicada |
| Políticas por rol | Fase B: `SELECT` por rol + `current_user_role()` (`20260722`). `integration_logs`/`settings`/`company_settings` solo admin; el resto operativo | ⚠️ política amplia en tablas muy sensibles — ver plan |
| Aprovisionamiento de perfil | Trigger `on_auth_user_created` crea el perfil (`solo_lectura`) al registrarse (`20260721`) | ✅ |
| Bypass de service role | La app consulta con service role (`BYPASSRLS`), así que RLS es defensa en profundidad, no el punto de aplicación primario | ✅ por diseño |
| Lecturas por sesión | `getReadClient()` tras el flag `RLS_SESSION_READS` (off por defecto); solo `contract-control` migrado | ⚠️ incremental |
| Vistas de backoffice | `security_invoker = on` para que la RLS de las tablas base aplique al consultar la vista | ⚠️ frágil — ver plan |

> **Origen de este pilar.** Durante el proyecto se descubrió que la migración de RLS **nunca se había aplicado**: la anon key pública leía todas las tablas (504 empleados, 48 cuentas bancarias, 310 solicitudes, 347 logs). Se aplicaron las tres migraciones y se verificó el cierre. La lección — un control central que dependía de un paso manual sin verificación automatizada — está en el [plan de endurecimiento](#plan-de-endurecimiento).

---

## 5. Validación server-side

**No confiar en el cliente: validar la entrada en el borde de la API.**

| Caso común | Cómo se resuelve | Estado |
|---|---|---|
| Cuerpo y query | `parseJsonBody` / `parseQuery` con esquemas Zod, formato de error uniforme. `src/lib/api/validation.ts`, `src/lib/whatsapp/schemas.ts` | ⚠️ 5 endpoints sin validar IDs — ver plan |
| Inyección en filtros | Los valores del `.or()` de PostgREST se escapan (`escapePostgrestValue`), evitando romper la estructura del filtro | ✅ |
| UUID como Postgres | `uuidParam` acepta cualquier UUID hexadecimal (como el tipo `uuid`), no más estricto que la base | ✅ |
| Paginación | Se **acota** en vez de rechazar; un valor no numérico cae al default (evita `NaN` → 500) | ✅ |
| Fechas | `z.coerce.date()` rechaza fechas no parseables (evita `Invalid Date.toISOString()` → 500) | ✅ |
| Estados en lote | `mode: "status"` acotado a estados permitidos (`pendiente_envio`); rechaza el resto con 400 | ✅ |

---

## Plan de endurecimiento

Huecos reales encontrados en la auditoría del 2026-07-21, priorizados. Ninguno bloquea el funcionamiento; son mejoras de postura de seguridad. Los de **documentación** ya se corrigieron en esta pasada; los de **código** quedan como trabajo pendiente.

### Prioridad alta

| # | Pilar | Hueco | Recomendación |
|---|---|---|---|
| H1 | Autorización | **`POST /api/whatsapp/request-contract` no tiene `requireRole` ni auth de máquina.** Está tras el gate de sesión, así que cualquier sesión —incluida `solo_lectura`— puede dispararlo. Ejecuta escrituras reales y efectos externos (crea el contrato en EasyLex, envía el link). Es el **único endpoint de escritura de sesión sin guard**, y sobrevive incluso a `enforce`. | Añadir `requireRole("operaciones")` al inicio. Si un sistema externo debe llamarlo sin sesión, enrutarlo como webhook/tarea con su propia autenticación de máquina. Añadir también rate limit (ver M4). |
| H2 | RLS | **Sin verificación automatizada del invariante de RLS.** Las migraciones se aplican a mano; el CI no comprueba `rowsecurity`, políticas ni `security_invoker`. Es la causa raíz exacta de la fuga original. | Test post-deploy que consulte `pg_tables.rowsecurity`, `pg_policies` y el `security_invoker` de las vistas, y falle si alguna de las 18 tablas o las 2 vistas no cumple. Convierte "aplicado" en verificable. |

### Prioridad media

| # | Pilar | Hueco | Recomendación |
|---|---|---|---|
| M1 | RLS | **Política de lectura demasiado amplia en tablas muy sensibles.** `employee_bank_accounts` (CLABE), `raw_import_rows` (PII cruda), `whatsapp_contacts/messages`, `easylex_events` reciben la misma política operativa (`current_user_role() is not null`), legible por `solo_lectura`. `integration_logs` sí se restringió a admin. | Restringir `employee_bank_accounts` (y valorar las demás) a `operaciones`/`admin`, alineando la sensibilidad de la tabla con el rol. Hacerlo **antes** de encender `RLS_SESSION_READS`. |
| M2 | RLS | **`security_invoker` de las vistas es frágil.** El `ALTER VIEW` va dentro de un `exception when others` que ante error solo emite `notice` y continúa (podría dejar la vista como `security_definer` = bypass), y el `CREATE VIEW` original no lleva el reloption, así que una redefinición futura lo revierte. | Verificarlo como invariante testeado (H2). Considerar `REVOKE SELECT … FROM anon` sobre las vistas como cinturón extra. Re-aplicar el reloption en cada migración que recree una vista. |
| M3 | Autenticación | **El binding a la service account del OIDC de Cloud Tasks es opcional.** Sin `TASKS_INVOKER_SERVICE_ACCOUNT`, se acepta cualquier ID token firmado por Google con `audience` correcto. El `audience` además se deriva del `Host` entrante, no de la config. | Exigir `TASKS_INVOKER_SERVICE_ACCOUNT` en producción (rechazar si falta). Derivar el `audience` de `workerBaseUrl`. Añadir test del happy-path OIDC (hoy solo se testea el rechazo). |
| M4 | Rate limiting | **Escrituras caras sin rate limit:** `request-contract` (genera PDF + EasyLex), `imports/[batchId]/apply` (aplica el CSV completo), y las acciones por-registro `backoffice/contracts/*/retry`+`/regenerate-link` (llaman a EasyLex). El equivalente en lote sí se limita. | Añadir `enforceRateLimit` a cada uno (`whatsappBulkSend` para los que tocan EasyLex; `importUpload` para apply). |
| M5 | Rate limiting | **`getClientIp` es evadible bajo Cloud Run.** Toma la **primera** entrada de `x-forwarded-for`, que el cliente controla; un atacante rota una IP falsa por petición y obtiene una clave distinta cada vez, evadiendo el límite por IP en los webhooks públicos. | Derivar la IP desde una posición de confianza (contada desde la derecha según el nº de proxies). Mitigante: la firma HMAC sigue rechazando lo no legítimo — degrada el anti-DoS, no la autenticación. |
| M6 | Autenticación | **Sin allow-list de dominio en el código para el login de Google.** Quién puede autenticarse queda 100% delegado a la config de Supabase (permisiva por defecto). Combinado con RBAC en `warn`, un usuario de Google no autorizado que Supabase admita podría entrar y ejecutar escrituras. | Validar el dominio del email (`hd`) en el callback o en `getCurrentActor` y rechazar los no permitidos. Verificar además la restricción en Supabase Auth y planear el paso a `enforce`. |
| M7 | Validación | **5 endpoints no validan IDs como UUID → `500` en vez de `400`:** `/whatsapp/messages/employee`, `/whatsapp/imports`, `/imports/[batchId]/apply`, y los dos de `backoffice/contracts/*`. Un ID mal formado revienta contra la columna `uuid`. | Validar cada ID con `uuidParam()` vía `parseQuery`, o un validador de path param antes de la primera consulta. |

### Prioridad baja

| # | Pilar | Hueco | Recomendación |
|---|---|---|---|
| L1 | Autorización | `GET /api/whatsapp/config` devuelve `whatsapp_webhook_verify_token` sin `requireRole` (el POST sí exige admin). Un `solo_lectura` puede leerlo. | Añadir `requireRole("admin")` al GET, o excluir el verify token de la respuesta. |
| L2 | Validación | `BulkSendBodySchema.employeeIds` no tiene tope máximo (`PhoneAuditFixBodySchema` sí acota a 5000). | Añadir un `.max(N)` razonable, alineado con el tope operativo del envío. |
| L3 | Validación | `/whatsapp/bulk/detail` no maneja `PGRST103` (rango fuera de límites) como sí hace `bulk/history`: un `page` alto da 500. | Replicar el manejo de `bulk/history` (devolver página vacía) o capar el `page`. |
| L4 | Validación | `/whatsapp/test` lee el cuerpo con `request.json()` + `as`, sin Zod: un JSON malformado da 500. | Definir un esquema Zod y usar `parseJsonBody` para uniformar el 400. |
| L5 | Autenticación | Los health checks (`/api/health*`) son públicos y exponen `error.message` crudo, presencia de env vars y tablas. Además el prefijo `/api/health` sin barra final dejaría público un futuro `/api/health-xyz`. | Reducir la verbosidad del payload público y normalizar el prefijo a `/api/health/`. |
| L6 | Autenticación | Toda la superficie de fail-open de desarrollo depende de un único `NODE_ENV === "production"`: un despliegue con `NODE_ENV` mal fijado desactivaría de golpe las verificaciones de firma. | Endurecer con una segunda señal (exigir que los secretos estén presentes con independencia de `NODE_ENV`, o afirmar `NODE_ENV` al arranque). |

### Decisiones conscientes (no son huecos, pero deben quedar explícitas)

Estas son limitaciones **deliberadas y documentadas**, con su plan de activación. Conviene que no se confundan con huecos ni se olviden en el endurecimiento final:

- **RBAC en `warn`** por defecto → plan: pasar a `enforce` tras promover a los admins (`BOOTSTRAP_ADMIN_EMAILS`).
- **Rate limiting en memoria, por instancia** → plan: Redis cuando haga falta un límite global exacto.
- **Lecturas RLS por sesión tras `RLS_SESSION_READS`** (off por defecto, solo `contract-control` migrado) → plan: migrar el resto de lecturas y encender el flag tras M1.
- **CSP en `Report-Only`** → plan: pasar a `enforce` tras verificar que no rompe nada.

La combinación **`warn` + sin allow-list de dominio (M6)** es la que más conviene cerrar pronto.
