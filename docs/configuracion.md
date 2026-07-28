# Configuración

Hay tres lugares donde vive la configuración, con precedencias distintas. Confundirlos es la causa habitual de "cambié el valor y no pasó nada".

| Origen | Para qué | Precedencia |
|---|---|---|
| Variables de entorno | Credenciales e infraestructura | **Gana siempre** |
| Tabla `settings` | Credenciales de WhatsApp escritas desde la UI | Solo si no hay env var |
| Tabla `company_settings` | Datos de negocio del contrato y validaciones de EasyLex | Única fuente (no hay env var equivalente) |

## Variables de entorno

Plantilla completa en `.env.example`. Copiar a `.env.local` para desarrollo:

```bash
cp .env.example .env.local
```

`.env*` está en `.gitignore`; ningún archivo de entorno está versionado.

### Supabase

| Variable | Requerida | Notas |
|---|---|---|
| `SUPABASE_URL` | sí | **Incluye el sufijo `/rest/v1/`**. El código lo normaliza con `new URL(url).origin` |
| `SUPABASE_SERVICE_ROLE_KEY` | sí | Acceso total. Solo servidor, nunca al cliente |
| `SUPABASE_ANON_KEY` | sí | Para el cliente de sesión (SSR) |
| `SUPABASE_SECRET_KEY` | no | Fallback de `SUPABASE_SERVICE_ROLE_KEY` |

`validateSupabaseEnv()` **lanza excepción** si falta algo, a diferencia de las validaciones de WhatsApp y EasyLex, que devuelven un resultado.

> `src/lib/supabase/server.ts` lee `.env.local` **desde disco en tiempo de ejecución**, no solo a través de la carga de entorno de Next. En un contenedor donde ese archivo no existe la lectura simplemente no hace nada y se usan las variables del proceso — que es el comportamiento deseado, pero conviene saberlo al depurar diferencias entre local y producción.

### WhatsApp Cloud API

| Variable | Requerida | Notas |
|---|---|---|
| `WHATSAPP_ACCESS_TOKEN` | sí | Token de la app de Meta |
| `WHATSAPP_PHONE_NUMBER_ID` | sí | Id del número en Meta |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | sí | Necesario para sincronizar plantillas |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | sí | Valor inventado, debe coincidir con el de Meta |
| `WHATSAPP_APP_SECRET` | sí | Verifica la firma HMAC del webhook. **Sin él, en producción el webhook rechaza todo** |
| `WHATSAPP_BUSINESS_NUMBER` | no | Formato `^\+?\d{10,15}$` |
| `WHATSAPP_TEMPLATE_HEADER_IMAGE_URL` | no | Añade cabecera de imagen a `adelanto_nomina_v2` |
| `WHATSAPP_DEBUG_AUTO_REPLY` | no | `"true"` para responder mensajes entrantes. Solo desarrollo |

Las dos últimas **no están en el esquema de `src/lib/env.ts`**: se leen directamente de `process.env`, así que no aparecen en los health checks ni en los errores de validación.

> `WHATSAPP_APP_SECRET` es obligatorio en producción: el webhook verifica `X-Hub-Signature-256` con él y, si no está definido, rechaza todos los eventos con `401`. Ver [WhatsApp](whatsapp.md#webhook-de-meta).

### EasyLex

| Variable | Requerida | Notas |
|---|---|---|
| `EASYLEX_ACCESS_KEY_ID` | sí | |
| `EASYLEX_SECRET_ACCESS_KEY` | sí | |
| `EASYLEX_BASE_URL` | no | **Default: `https://sandboxapi.easylex.com`** |
| `EASYLEX_SIGNING_LINK_BASE_URL` | no | Default: `https://widgetsandbox.easylex.com/firmar` |
| `EASYLEX_CALLBACK_URL` | sí | **Debe terminar en `/api/webhooks/easylex/sign`** |
| `EASYLEX_WEBHOOK_SECRET` | sí en producción | Si está vacío, en producción **el webhook rechaza todo** con `401` |

Los dos defaults apuntan a sandbox. Sin definirlos explícitamente, producción firma contra el entorno de pruebas de EasyLex.

### Aplicación

| Variable | Requerida | Notas |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | sí | Base del `redirectTo` de Google OAuth. Única variable expuesta al cliente |

### Cola de envío masivo (opcional)

Sin estas variables el envío masivo corre dentro del request (modo inline). Definiéndolas **todas**, pasa a ser asíncrono vía Google Cloud Tasks.

| Variable | Requerida | Notas |
|---|---|---|
| `GCP_PROJECT_ID` | para la cola | |
| `CLOUD_TASKS_LOCATION` | no | Default `us-central1` |
| `CLOUD_TASKS_QUEUE` | para la cola | Default `whatsapp-bulk` |
| `TASKS_WORKER_BASE_URL` | para la cola | URL pública del propio servicio |
| `TASKS_INVOKER_SERVICE_ACCOUNT` | para la cola | Service account que firma el token OIDC |
| `TASKS_WORKER_SECRET` | no | Solo desarrollo; en producción se ignora |
| `QUEUE_DRIVER` | no | `inline` o `cloud-tasks`. Vacío = automático |

Si falta una sola de las cuatro obligatorias, el sistema **degrada a inline y lo registra** en vez de fallar: la cola es una mejora opt-in.

`QUEUE_DRIVER=inline` desactiva la cola sin desmontar el resto de la configuración — útil para volver atrás rápido.

La autenticación usa ADC (Application Default Credentials), que en Cloud Run funciona sin configuración adicional. Ver [WhatsApp](whatsapp.md#cola).

### Observabilidad de errores (Sentry) — opcional

| Variable | Notas |
|---|---|
| `SENTRY_DSN` | DSN de servidor. **Sin él, el SDK no se carga y nada cambia** |
| `NEXT_PUBLIC_SENTRY_DSN` | DSN de navegador; puede ser el mismo valor |
| `SENTRY_ENVIRONMENT` / `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | Etiqueta de entorno; por defecto `NODE_ENV` |
| `SENTRY_TRACES_SAMPLE_RATE` / `NEXT_PUBLIC_...` | Fracción 0–1 de tracing; por defecto `0` |

Cómo funciona: el arranque nativo de Next (`src/instrumentation.ts`) inicializa Sentry solo si hay DSN, cargándolo de forma dinámica. Una vez activo, `logger.error` y `logger.critical` reportan automáticamente —el logger es el punto único por el que ya pasan todos los errores— junto con los errores de servidor que Next captura vía `onRequestError`.

No se usa `withSentryConfig` (el envoltorio webpack de Sentry) para no chocar con el build de Turbopack. La contrapartida es que **no se suben source maps**: los stack traces del servidor ya son legibles, pero los del navegador irán minificados hasta que se configure la subida por separado.

### Google Docs (obligatorio para generar contratos)

**No usa variables de entorno.** `src/lib/google/auth.ts` lee `google_oauth_client.json` y `token.json` desde `process.cwd()`. El `token.json` se genera una sola vez con `pnpm dlx tsx scripts/google-auth.ts`: abre una URL, inicias sesión con la cuenta dueña de la plantilla del contrato, apruebas Drive + Docs, y guarda el token.

> No es opcional: la generación de contratos pasa por Google Docs. Sin esos dos archivos, `POST /api/whatsapp/request-contract` falla con `ENOENT` y devuelve `400`. En un contenedor hay que montarlos explícitamente (por ejemplo, como volumen desde Secret Manager). Ver [EasyLex y contratos](easylex-contratos.md#generación-del-pdf).

## Roles y permisos (RBAC)

| Variable | Notas |
|---|---|
| `BOOTSTRAP_ADMIN_EMAILS` | Lista separada por comas. Esos correos se promueven a `admin` al iniciar sesión |
| `RBAC_ENFORCEMENT` | `warn` (por defecto) o `enforce` |

Los roles son acumulativos: `solo_lectura` < `operaciones` < `admin`. El reparto por endpoint está en [API](api.md#autorización-por-rol).

**Todos los perfiles nacen como `solo_lectura`.** Sin `BOOTSTRAP_ADMIN_EMAILS`, tras aplicar la migración nadie puede ejecutar acciones de escritura y habría que promover al primer administrador editando la base a mano:

```sql
update public.profiles set role = 'admin' where email = 'tu@correo.com';
```

**Despliega primero en `warn`.** En ese modo, un rol insuficiente no bloquea: deja pasar la petición y registra `auth.insufficient_role`. Revisa esos logs, confirma que los roles asignados son los correctos, y solo entonces pon `enforce`. Es el mismo despliegue por fases que la CSP, y evita quedarte fuera de tu propia aplicación.

Ver quién tiene qué rol:

```sql
select email, role from public.profiles order by role, email;
```

## Tabla `settings`

La escribe el formulario `Ajustes → Conexión` (`/settings/whatsapp`) vía `POST /api/whatsapp/config`, que exige rol `admin`.

Claves: `whatsapp_phone_number_id`, `whatsapp_business_number`, `whatsapp_webhook_verify_token`.

> **Los secretos ya no se guardan aquí.** `whatsapp_access_token` y `whatsapp_app_secret` se rechazan: quedaban sin cifrar y accesibles a cualquier sesión autenticada. Van en variables de entorno. Si tu base tiene filas antiguas con esas claves, bórralas — no se leen, pero siguen expuestas:
>
> ```sql
> delete from public.settings where key in ('whatsapp_access_token', 'whatsapp_app_secret');
> ```

## Tabla `company_settings`

Configuración de negocio, editable en base sin redeploy. Se lee con `getCompanySettings()` / `getCompanySetting(key)`.

### Datos del acreedor (contrato)

| Clave | Estado |
|---|---|
| `acreedor_razon_social` | sembrada — `LOZAV CONSTRUCTORES, SOCIEDAD ANÓNIMA DE CAPITAL VARIABLE` |
| `acreedor_representante` | sembrada — `DARA JAHDAI LOPEZ DE LOS ANGELES` |
| `acreedor_rfc` | sembrada — `LCO2105032T5` |
| `acreedor_domicilio` | sembrada |
| `acreedor_banco` | **vacía — (LLENAR)** |
| `acreedor_cuenta` | **vacía — (LLENAR)** |
| `acreedor_clabe` | **vacía — (LLENAR)** |
| `testigo_1_nombre` | **vacía — (LLENAR)** |
| `testigo_2_nombre` | **vacía — (LLENAR)** |

Las cinco vacías deben llenarse antes de emitir contratos reales.

### Validaciones de EasyLex

Booleanos en texto: `easylex_validate_biometric` y `easylex_validate_liveness` en `true`; `easylex_validate_id`, `easylex_validate_sms`, `easylex_validate_picture`, `easylex_validate_email`, `easylex_validate_voice` en `false`.

## Checklist antes de producción

Configuración:

- [ ] `EASYLEX_BASE_URL` y `EASYLEX_SIGNING_LINK_BASE_URL` apuntando a producción, no a sandbox
- [ ] `EASYLEX_WEBHOOK_SECRET` definido (si está vacío no hay autenticación de webhook)
- [ ] **Credenciales de EasyLex que autentiquen.** Bloqueo verificado (2026-07-20): las llaves del panel de EasyLex son rechazadas por su propia API (`code 106`), en sandbox y producción. No es del código —está correcto—; es de la cuenta EasyLex. Soporte debe habilitar el acceso a la API. Detalle en [EasyLex y contratos](easylex-contratos.md#autenticación)
- [ ] `EASYLEX_CALLBACK_URL` terminando en `/api/webhooks/easylex/sign`
- [ ] Las cinco claves `(LLENAR)` de `company_settings` completadas
- [ ] Secretos en un gestor de secretos, no en la tabla `settings`
- [ ] `NEXT_PUBLIC_APP_URL` con el dominio real (rompe el OAuth si no)
- [ ] Webhook de Meta apuntando al dominio público y verificado

- [x] **RLS aplicada y verificada (2026-07-21).** Se descubrió (2026-07-20) que la anon key **pública** leía todas las tablas (504 empleados, 48 cuentas bancarias, 310 solicitudes, 347 logs) porque la migración nunca se había aplicado. Se aplicaron las tres migraciones y se verificó el cierre: la anon key sin sesión devuelve **0 filas** en las 18 tablas.
- [x] Aplicadas, en orden: `20260720_enable_rls_deny_all.sql` (deny-all), `20260721_profiles_provisioning_and_roles.sql` (perfiles), `20260722_rls_policies_phase_b.sql` (políticas por rol)
- [ ] **Aplicar `20260723_restrict_sensitive_reads.sql`** (M1): restringe la lectura de `employee_bank_accounts` y `raw_import_rows` a `operaciones`+. Hacerlo **antes** de encender `RLS_SESSION_READS`.
- [ ] **Al aprovisionar una base de producción separada, aplicar TODAS las migraciones en orden y re-verificar el count 0** — runbook paso a paso en [Migrar base de producción](migrar-base-produccion.md)
- [x] Test automatizado del invariante de RLS (H2): `pnpm verify:rls` (`RUN_RLS_CHECK=1`) — verifica que la anon key devuelve 0 filas en las 18 tablas. Correrlo en CI/post-deploy.
- [ ] Tras aplicar M1, poner `RLS_SESSION_READS=on` para que las lecturas del backoffice usen el cliente de sesión
- [ ] Definir `BOOTSTRAP_ADMIN_EMAILS` **antes** de poner `RBAC_ENFORCEMENT=enforce`
- [ ] Borrar de `settings` las filas antiguas con secretos en texto plano
- [ ] **Generar y montar las credenciales de Google** — sin ellas no se genera ningún contrato. Descarga `google_oauth_client.json` (OAuth client tipo Desktop) de Google Cloud Console, corre `pnpm dlx tsx scripts/google-auth.ts` para generar `token.json`, y monta ambos en el contenedor
- [ ] Definir `WHATSAPP_CONTRACT_TEMPLATE` con una plantilla aprobada en Meta que tenga un botón URL, para que el link de firma se envíe al empleado
- [ ] Verificar que la consola no reporta violaciones de CSP, y entonces cambiar `Content-Security-Policy-Report-Only` a `Content-Security-Policy` en `next.config.ts`

Ya resuelto en código (fase 1 de endurecimiento):

- [x] Verificación HMAC de `X-Hub-Signature-256` en el webhook de Meta
- [x] Webhook de EasyLex con comparación en tiempo constante y *fail closed*
- [x] `mock-sign` deshabilitado en producción
- [x] RLS deny-all en las 18 tablas + `security_invoker` en las vistas — **aplicada y verificada en la base actual** (anon key = 0 filas)
- [x] Cabeceras de seguridad HTTP y `poweredByHeader: false`

Ya resuelto (fase 4):

- [x] RBAC con `requireRole()` en **todas** las rutas de escritura, incluida `POST /api/whatsapp/request-contract` (H1 resuelto 2026-07-23: `requireRole("operaciones")` + rate limit)
- [x] Aprovisionamiento automático de `profiles` y función `current_user_role()`
- [x] Secretos fuera de la tabla `settings`
- [x] Módulo de auditoría compartido, con el operador registrado

Ya resuelto (fase 5):

- [x] Rate limiting en webhooks y endpoints de escritura caros
- [x] Observabilidad de errores (Sentry), inerte sin DSN

Seguridad pendiente en el código:

- [x] Fase B de RLS: políticas por rol aplicadas (`20260722`); primer camino de lectura migrado al cliente de sesión (`contract-control`)
- [ ] Migrar el resto de lecturas al cliente de sesión y encender `RLS_SESSION_READS`
- [x] **Endurecimiento — resuelto H1, H2, M1** (2026-07-23): guard en `request-contract`, test de invariante RLS, migración de lectura sensible. Ver el [Plan de endurecimiento](seguridad.md#plan-de-endurecimiento)
- [x] **Endurecimiento H1–H2, M1–M7, L1–L6 resuelto en código** (2026-07-23). Pendiente solo de despliegue: aplicar la migración `20260723` y definir las env vars opt-in (`ALLOWED_EMAIL_DOMAINS`, `TRUSTED_PROXY_COUNT`, `WEBHOOK_ENFORCE_SIGNATURES`, `TASKS_INVOKER_SERVICE_ACCOUNT`, `TASKS_WORKER_BASE_URL`). Ver [Plan de endurecimiento](seguridad.md#plan-de-endurecimiento)

Ver también: [WhatsApp](whatsapp.md) · [EasyLex y contratos](easylex-contratos.md) · [Infraestructura](infraestructura.md)
