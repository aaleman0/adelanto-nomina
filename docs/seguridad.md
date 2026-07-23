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

**Resuelto (2026-07-23):** H1, H2 y M1 ya están implementados — ver la sección de abajo. El resto sigue pendiente.

### Resuelto

| # | Pilar | Qué se hizo |
|---|---|---|
| ✅ H1 | Autorización | `POST /api/whatsapp/request-contract` ahora exige `requireRole("operaciones")` + `enforceRateLimit(contractRequest)` (30/min). Era el único endpoint de escritura de sesión sin guard. |
| ✅ H2 | RLS | Test automatizado del invariante en `src/lib/security/rls-invariant.test.ts` (`pnpm verify:rls`): con la anon key, las 18 tablas deben devolver 0 filas. Desactivado por defecto; corre en CI/post-deploy con `RUN_RLS_CHECK=1`. Verificado en vivo: 18/18 a 0. |
| ✅ M1 | RLS | Migración `20260723_restrict_sensitive_reads.sql`: la lectura de `employee_bank_accounts` (CLABE) y `raw_import_rows` (PII cruda) pasa de "cualquier aprovisionado" a `operaciones`+. **Pendiente aplicarla** en el SQL Editor antes de encender `RLS_SESSION_READS`. |

### Prioridad alta (pendiente)

_H1 y H2 resueltos (ver arriba). Sin pendientes de prioridad alta._

### Prioridad media

| # | Pilar | Hueco | Recomendación |
|---|---|---|---|
| ~~M1~~ | RLS | ✅ **Resuelto** (ver sección Resuelto): `employee_bank_accounts` y `raw_import_rows` restringidas a `operaciones`+ vía `20260723_restrict_sensitive_reads.sql`. Queda **valorar** si `whatsapp_contacts/messages` y `easylex_events` merecen el mismo trato (siguen operativas). | Aplicar la migración antes de encender `RLS_SESSION_READS`. |
| M2 | RLS | **`security_invoker` de las vistas es frágil** (parcial): el `ALTER VIEW` podría fallar en silencio o revertirse al recrear la vista. ✅ El test de invariante (H2) **ahora también comprueba las 2 vistas** (anon = 0 filas), así que una regresión a `security_definer` se detecta. Pendiente: re-aplicar el reloption en cada migración que recree una vista. | Re-aplicar `security_invoker = on` en cada `create view`. Considerar `REVOKE SELECT … FROM anon` como cinturón extra. |
| ~~M3~~ | Autenticación | ✅ **Resuelto**: en producción se **exige** `TASKS_INVOKER_SERVICE_ACCOUNT`, y el `audience` se deriva del **origen configurado** (`TASKS_WORKER_BASE_URL`) + el path real, no del `Host` entrante. Con test de happy-path OIDC (`cloud-tasks-auth.oidc.test.ts`, `googleapis` mockeado). | — |
| ~~M4~~ | Rate limiting | ✅ **Resuelto**: `request-contract` (`contractRequest`, 30/min), `imports/[batchId]/apply` (`importUpload`, 20/min) y `backoffice/contracts/*/retry`+`/regenerate-link` (`backofficeAction`, 30/min) tienen rate limit. | — |
| M5 | Rate limiting | **`getClientIp` es evadible bajo Cloud Run** (pendiente, a propósito). Toma la primera entrada de `x-forwarded-for`, que el cliente controla. **No se implementó** porque la semántica exacta de `x-forwarded-for` es específica del despliegue y un parser sutilmente incorrecto sería peor que el estado actual; requiere fijar la topología de proxies real. Mitigante: la firma HMAC sigue rechazando lo no legítimo — degrada el anti-DoS, no la autenticación. | Al desplegar, derivar la IP desde una posición de confianza según el nº real de proxies (p. ej. `TRUSTED_PROXY_COUNT`), verificado contra el comportamiento real de Cloud Run. |
| M6 | Autenticación | ✅ **Resuelto** (opt-in): el callback de OAuth valida el dominio del correo contra `ALLOWED_EMAIL_DOMAINS`. Si está definida, un correo de otro dominio se rechaza (sign-out + redirect); vacía = sin restricción (comportamiento actual). Definirla en producción. | Definir `ALLOWED_EMAIL_DOMAINS` y verificar además la restricción en Supabase Auth. |
| ~~M7~~ | Validación | ✅ **Resuelto**: los 5 endpoints (`/whatsapp/messages/employee`, `/whatsapp/imports`, `/imports/[batchId]/apply`, y los dos de `backoffice/contracts/*`) validan el ID con `isUuid()` y devuelven 400 antes de tocar la base. | — |

### Prioridad baja

| # | Pilar | Hueco | Recomendación |
|---|---|---|---|
| ~~L1~~ | Autorización | ✅ **Resuelto**: `GET /api/whatsapp/config` ahora exige `requireRole("admin")`, igual que el POST. | — |
| ~~L2~~ | Validación | ✅ **Resuelto**: `BulkSendBodySchema.employeeIds` acota a `.max(5000)`, igual que `PhoneAuditFixBodySchema`. | — |
| ~~L3~~ | Validación | ✅ **Resuelto**: `/whatsapp/bulk/detail` maneja `PGRST103` (página fuera de rango) devolviendo página vacía, como `bulk/history`. | — |
| ~~L4~~ | Validación | ✅ **Resuelto**: `/whatsapp/test` usa `WhatsAppTestBodySchema` + `parseJsonBody`; un JSON malformado da 400 uniforme. | — |
| L5 | Autenticación | ✅ **Parcial**: (1) el proxy ya no deja público un futuro `/api/health-xyz` (match exacto + prefijo `/api/health/`); (2) `/api/health` ya no expone el `error.message` de Supabase ni las env vars faltantes (solo booleanos; el detalle va a los logs). Pendiente: `/api/health/whatsapp` sigue exponiendo presencia de env vars y nombres de tablas, porque el script `verify-whatsapp-setup.ts` depende de esa forma. | Mover el detalle de `/api/health/whatsapp` tras auth, o desacoplar el script. |
| L6 | Autenticación | **Pendiente** (a propósito). El fail-open depende de `NODE_ENV`, pero **solo se activa si además el secreto está ausente** (doble misconfiguración): con el secreto presente, la firma se verifica siempre. Cambiar la condición en tiempo de request arriesga romper los tests E2E de webhook (dependen del modo laxo de dev), que no se pueden correr aquí sin efectos reales. | Requerir un flag explícito (`ALLOW_INSECURE_WEBHOOKS`) para el modo laxo en vez de inferirlo de `NODE_ENV`, verificándolo con la suite E2E en un entorno seguro. |

### Decisiones conscientes (no son huecos, pero deben quedar explícitas)

Estas son limitaciones **deliberadas y documentadas**, con su plan de activación. Conviene que no se confundan con huecos ni se olviden en el endurecimiento final:

- **RBAC en `warn`** por defecto → plan: pasar a `enforce` tras promover a los admins (`BOOTSTRAP_ADMIN_EMAILS`).
- **Rate limiting en memoria, por instancia** → plan: Redis cuando haga falta un límite global exacto.
- **Lecturas RLS por sesión tras `RLS_SESSION_READS`** (off por defecto, solo `contract-control` migrado) → plan: migrar el resto de lecturas y encender el flag tras M1.
- **CSP en `Report-Only`** → plan: pasar a `enforce` tras verificar que no rompe nada.

La combinación **`warn` + sin allow-list de dominio (M6)** es la que más conviene cerrar pronto.
