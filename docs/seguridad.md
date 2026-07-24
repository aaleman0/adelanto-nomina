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

Huecos reales encontrados en la auditoría del 2026-07-21, priorizados. Ninguno bloquea el funcionamiento; son mejoras de postura de seguridad.

**Estado (2026-07-23): los 15 items (H1–H2, M1–M7, L1–L6) están resueltos en código.** Cada fila de abajo lo detalla. Quedan solo **acciones de despliegue** (no código):

- **Aplicar la migración `20260723_restrict_sensitive_reads.sql`** (M1) en el SQL Editor, antes de encender `RLS_SESSION_READS`.
- **Definir en producción** las variables que activan las protecciones opt-in: `ALLOWED_EMAIL_DOMAINS` (M6), `TASKS_INVOKER_SERVICE_ACCOUNT` + `TASKS_WORKER_BASE_URL` (M3), `TRUSTED_PROXY_COUNT` (M5), `WEBHOOK_ENFORCE_SIGNATURES=true` (L6).
- **Correr `pnpm verify:rls`** (H2) como gate post-deploy.

### Prioridad alta

| # | Pilar | Estado |
|---|---|---|
| ~~H1~~ | Autorización | ✅ **Resuelto**: `POST /api/whatsapp/request-contract` exige `requireRole("operaciones")` + `enforceRateLimit(contractRequest)` (30/min). Era el único endpoint de escritura de sesión sin guard. |
| ~~H2~~ | RLS | ✅ **Resuelto**: test automatizado del invariante (`src/lib/security/rls-invariant.test.ts`, `pnpm verify:rls`): con la anon key las 18 tablas + 2 vistas devuelven 0 filas. Off por defecto; corre con `RUN_RLS_CHECK=1` en CI/post-deploy. Verificado en vivo: 20/20. |

### Prioridad media

| # | Pilar | Hueco | Recomendación |
|---|---|---|---|
| ~~M1~~ | RLS | ✅ **Resuelto** (ver sección Resuelto): `employee_bank_accounts` y `raw_import_rows` restringidas a `operaciones`+ vía `20260723_restrict_sensitive_reads.sql`. Queda **valorar** si `whatsapp_contacts/messages` y `easylex_events` merecen el mismo trato (siguen operativas). | Aplicar la migración antes de encender `RLS_SESSION_READS`. |
| M2 | RLS | **`security_invoker` de las vistas es frágil** (parcial): el `ALTER VIEW` podría fallar en silencio o revertirse al recrear la vista. ✅ El test de invariante (H2) **ahora también comprueba las 2 vistas** (anon = 0 filas), así que una regresión a `security_definer` se detecta. Pendiente: re-aplicar el reloption en cada migración que recree una vista. | Re-aplicar `security_invoker = on` en cada `create view`. Considerar `REVOKE SELECT … FROM anon` como cinturón extra. |
| ~~M3~~ | Autenticación | ✅ **Resuelto**: en producción se **exige** `TASKS_INVOKER_SERVICE_ACCOUNT`, y el `audience` se deriva del **origen configurado** (`TASKS_WORKER_BASE_URL`) + el path real, no del `Host` entrante. Con test de happy-path OIDC (`cloud-tasks-auth.oidc.test.ts`, `googleapis` mockeado). | — |
| ~~M4~~ | Rate limiting | ✅ **Resuelto**: `request-contract` (`contractRequest`, 30/min), `imports/[batchId]/apply` (`importUpload`, 20/min) y `backoffice/contracts/*/retry`+`/regenerate-link` (`backofficeAction`, 30/min) tienen rate limit. | — |
| ~~M5~~ | Rate limiting | ✅ **Resuelto** (opt-in): `getClientIp` toma la IP contando desde la derecha según `TRUSTED_PROXY_COUNT` (los últimos N valores de `x-forwarded-for` los añade tu infra; en Cloud Run, 1), en vez de la primera entrada falsificable. Sin configurar (0) conserva el comportamiento histórico, así que no afecta a dev/tests. Con test unitario. **Definir `TRUSTED_PROXY_COUNT` en producción**, verificado contra el comportamiento real de Cloud Run. | Definir `TRUSTED_PROXY_COUNT`. |
| ~~M6~~ | Autenticación | ✅ **Resuelto** (opt-in): el callback de OAuth valida el correo contra un allow-list (`src/lib/auth/access-allowlist.ts`, con test). Dos formas combinables: **`ALLOWED_EMAILS`** (personas concretas — lo indicado para un equipo chico con PII) y `ALLOWED_EMAIL_DOMAINS` (dominio completo). Si hay alguno, un correo fuera se rechaza (sign-out + redirect); ninguno = sin restricción. | Definir `ALLOWED_EMAILS` en producción y verificar además la restricción en Supabase Auth. |
| ~~M7~~ | Validación | ✅ **Resuelto**: los 5 endpoints (`/whatsapp/messages/employee`, `/whatsapp/imports`, `/imports/[batchId]/apply`, y los dos de `backoffice/contracts/*`) validan el ID con `isUuid()` y devuelven 400 antes de tocar la base. | — |

### Prioridad baja

| # | Pilar | Hueco | Recomendación |
|---|---|---|---|
| ~~L1~~ | Autorización | ✅ **Resuelto**: `GET /api/whatsapp/config` ahora exige `requireRole("admin")`, igual que el POST. | — |
| ~~L2~~ | Validación | ✅ **Resuelto**: `BulkSendBodySchema.employeeIds` acota a `.max(5000)`, igual que `PhoneAuditFixBodySchema`. | — |
| ~~L3~~ | Validación | ✅ **Resuelto**: `/whatsapp/bulk/detail` maneja `PGRST103` (página fuera de rango) devolviendo página vacía, como `bulk/history`. | — |
| ~~L4~~ | Validación | ✅ **Resuelto**: `/whatsapp/test` usa `WhatsAppTestBodySchema` + `parseJsonBody`; un JSON malformado da 400 uniforme. | — |
| ~~L5~~ | Autenticación | ✅ **Resuelto**: (1) el proxy ya no deja público un futuro `/api/health-xyz` (match exacto + prefijo `/api/health/`); (2) ni `/api/health` ni `/api/health/whatsapp` exponen ya `error.message` crudo — el detalle va a los logs y la respuesta pública queda en booleanos. Nota: `/api/health/whatsapp` conserva los booleanos de `checks` (presencia de env/existencia de tablas) porque el script de readiness `verify-whatsapp-setup.ts` los consume; son de baja sensibilidad. | — |
| ~~L6~~ | Autenticación | ✅ **Resuelto** (opt-in): segunda señal `WEBHOOK_ENFORCE_SIGNATURES=true` que fuerza el rechazo de un webhook sin secreto **con independencia de `NODE_ENV`** (ambos webhooks, WhatsApp y EasyLex). Sin definir conserva el comportamiento actual (no afecta a dev/tests). **Definirla en producción** como cinturón por si `NODE_ENV` se fija mal. | Definir `WEBHOOK_ENFORCE_SIGNATURES=true` en producción. |

### Decisiones conscientes (no son huecos, pero deben quedar explícitas)

Estas son limitaciones **deliberadas y documentadas**, con su plan de activación. Conviene que no se confundan con huecos ni se olviden en el endurecimiento final:

- **RBAC en `warn`** por defecto → plan: pasar a `enforce` tras promover a los admins (`BOOTSTRAP_ADMIN_EMAILS`).
- **Rate limiting en memoria, por instancia** → plan: Redis cuando haga falta un límite global exacto.
- **Lecturas RLS por sesión tras `RLS_SESSION_READS`** (off por defecto, solo `contract-control` migrado) → plan: migrar el resto de lecturas y encender el flag tras M1.
- **CSP en `Report-Only`** → plan: pasar a `enforce` tras verificar que no rompe nada.

La combinación **`warn` + sin allow-list de dominio (M6)** es la que más conviene cerrar pronto.
