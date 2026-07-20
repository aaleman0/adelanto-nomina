# API

Fuente única de los endpoints. Todas las rutas viven en `src/app/api/` y declaran `export const runtime = "nodejs"`.

## Autenticación

El gate está en `src/proxy.ts` (convención `proxy` de Next.js 16 — **no existe `src/middleware.ts`**). Toda petición requiere una cookie de sesión de Supabase Auth salvo:

| Excepción | Valor |
|---|---|
| Rutas públicas | `/login`, `/auth/callback` |
| Prefijos de API públicos | `/api/webhooks/`, `/api/health`, `/api/tasks/` |

Los prefijos públicos no son rutas abiertas: cada una se autentica por su cuenta —los webhooks por firma HMAC o secreto compartido, y los workers de `/api/tasks/` por el token OIDC de Cloud Tasks—. Quedan fuera del gate de sesión porque quien las llama es una máquina sin cookie de navegador.

No hay API keys: una integración máquina-a-máquina contra estos endpoints no es posible sin una cookie de sesión válida. Las únicas excepciones son los webhooks y los workers de cola, que se autentican por firma o token OIDC.

## Autorización por rol

Sobre la sesión se aplica RBAC con `requireRole()` (`src/lib/auth/roles.ts`). Los roles son acumulativos: `solo_lectura` < `operaciones` < `admin`.

| Endpoint | Rol mínimo |
|---|---|
| Cualquier `GET` | `solo_lectura` |
| `POST /api/whatsapp/bulk?action=validate` | `solo_lectura` |
| `POST /api/whatsapp/bulk` (envío) | `operaciones` |
| `POST /api/imports` y `.../apply` | `operaciones` |
| `POST /api/backoffice/contracts/*` | `operaciones` |
| `POST /api/whatsapp/config` | `admin` |
| `POST /api/whatsapp/templates/sync` | `admin` |
| `POST /api/whatsapp/phone-audit/fix` | `admin` |
| `POST /api/whatsapp/test` | `admin` |

Las server actions de `src/app/contracts/actions.ts` comprueban `operaciones` por su cuenta, porque **no pasan por `src/proxy.ts`**.

Sin sesión → `401`. Con sesión y rol insuficiente → `403`, pero **solo en modo `enforce`**. Por defecto (`RBAC_ENFORCEMENT=warn`) la petición pasa y se registra `auth.insufficient_role`, para poder verificar los roles antes de bloquear. Ver [Configuración](configuracion.md#roles-y-permisos-rbac).

Si la validación de variables de entorno falla, el proxy captura el error y trata la petición como "sin usuario" — es decir, **falla cerrado**.

## Validación de entrada

Los endpoints validan con **Zod en el borde**, mediante los helpers de `src/lib/api/validation.ts`:

```ts
const parsed = await parseJsonBody(request, MiSchema);
if (!parsed.success) return parsed.response;
const { campo } = parsed.data;   // validado en runtime y tipado
```

- `parseJsonBody(request, schema)` — cuerpos JSON. Un JSON malformado devuelve `400` con mensaje propio.
- `parseQuery(request, schema)` — query params. Como llegan siempre como cadenas, los esquemas usan `z.coerce`.
- `escapePostgrestValue(value)` — entrecomilla un valor para usarlo dentro de un filtro `.or()` de PostgREST.

Los esquemas viven en `src/lib/whatsapp/schemas.ts`, separados de los handlers para poder testearlos sin levantar el servidor.

### Formato de error

```json
{
  "ok": false,
  "error": "importId: Es requerido cuando mode=import.",
  "issues": [{ "path": "importId", "message": "Es requerido cuando mode=import." }]
}
```

`error` incluye el nombre del campo y sirve para mostrar al operador; `issues` da el detalle estructurado por campo.

### Endpoints validados

`POST /api/whatsapp/bulk` · `GET /api/whatsapp/bulk/history` · `GET /api/whatsapp/bulk/detail` · `GET /api/whatsapp/employees/search` · `POST /api/whatsapp/config` · `POST /api/whatsapp/phone-audit/fix`

`POST /api/whatsapp/request-contract` conserva su parser propio (`parseRequestContractPayload`), porque acepta alias en snake y camelCase y ya tiene 11 tests unitarios que fijan ese comportamiento.

---

## Health

### `GET /api/health`
Estado general. Público.

Hace ping a Supabase (head-count sobre `settings`), corre `validateWhatsAppEnv()` y calcula la tasa de error de WhatsApp de las últimas 24 h sobre `whatsapp_contract_messages`.

```json
{
  "ok": true,
  "status": "ok",
  "timestamp": "2026-07-20T12:00:00.000Z",
  "services": {
    "supabase": { "ok": true, "configured": true, "error": null },
    "whatsapp": { "ok": true, "configured": true, "errors": [], "errorRate24h": 0, "alerting": false }
  }
}
```

`status` es `"ok"` o `"degraded"`. Devuelve **`200` si Supabase responde, `503` si no**. Cuando `errorRate24h > 10` emite el log `health.whatsapp.high_error_rate` y pone `alerting: true`.

### `GET /api/health/whatsapp`
Chequeo profundo: conectividad con Supabase, presencia de 5 variables de entorno y existencia de las tablas `whatsapp_contacts`, `whatsapp_contract_messages`, `whatsapp_bulk_sends`, `whatsapp_templates`.

```json
{
  "ok": true,
  "status": "healthy",
  "checks": {
    "supabase": true,
    "env": { "accessToken": true, "phoneNumberId": true, "businessAccountId": true, "webhookVerifyToken": true, "appSecret": true },
    "tables": { "whatsapp_contacts": true, "whatsapp_contract_messages": true, "whatsapp_bulk_sends": true, "whatsapp_templates": true }
  },
  "whatsappConfigured": true
}
```

Devuelve `503` **solo** si falla Supabase; que falten variables de entorno no lo marca como caído.

---

## Importaciones

### `POST /api/imports`
Sube y valida un CSV. Body `multipart/form-data` con el campo **`file`** (debe ser un `File` y terminar en `.csv`).

Flujo: `file.text()` → `prepareCsvImport()` → sube a Storage (`imports`, ruta `{uuid}/{safeFilename}`, `upsert: false`) → inserta `import_batches` → inserta `raw_import_rows` **solo si no faltan columnas**.

El estado del lote se decide así: `fallida` si faltan columnas requeridas, `aplicada_con_errores` si hay filas inválidas o duplicadas, `validando` en el resto.

```json
{
  "batch": { "id": "uuid", "filename": "…", "status": "validando",
             "total_rows": 120, "valid_rows": 118, "invalid_rows": 1,
             "duplicate_rows": 1, "created_at": "…" },
  "missingColumns": [],
  "summary": { }
}
```

`400` si no es un `File` o no es `.csv`; `500` ante cualquier excepción. Los mensajes de error están en español.

Subir el archivo **no aplica nada**: solo deja staging listo. Ver [importación CSV](importacion-csv.md).

### `POST /api/imports/[batchId]/apply`
Aplica las filas válidas del lote a `employees`, `employee_bank_accounts` y `advance_offers`, y registra auditoría.

```json
{ "batchId": "uuid", "status": "aplicada", "appliedRows": 118, "changedRows": 12,
  "unchangedRows": 106, "createdEmployees": 4, "updatedEmployees": 8,
  "createdOffers": 12, "replacedOffers": 8 }
```

`200` / `500`.

> Detalle de implementación: este handler **no usa `context.params`**. Extrae el id con un helper local que toma `segments.at(-2)` del pathname. Si se reorganiza la ruta, esto se rompe en silencio.

---

## Contrato

### `POST /api/whatsapp/request-contract`
El endpoint central del flujo. Valida elegibilidad, evita duplicados y devuelve el link de firma.

> Sustituye a `POST /api/manychat/request-contract`, que **ya no existe**.

El parser acepta alias en snake y camelCase:

| Campo | Alias aceptados | Requerido |
|---|---|---|
| subscriber id | `subscriber_id`, `subscriberId` | sí |
| RFC | `rfc`, `RFC` (se normaliza a mayúsculas) | sí |
| teléfono | `telefono_normalizado`, `telefono`, `phone` | no |
| nombre | `first_name`, `firstName` | no |
| apellido | `last_name`, `lastName` | no |

```json
{ "ok": true, "status": "contract_ready", "message": "…",
  "estatus_contrato": "generado",
  "request_id": "uuid", "attempt_id": "uuid",
  "link_easylex": "https://…", "expires_at": "…",
  "expires_at_formatted": "20 de julio de 2026, 14:00" }
```

`status` ∈ `contract_ready` · `already_signed` · `not_found` · `not_eligible` · `no_offer` · `invalid_request`.
`estatus_contrato` ∈ `generado` · `firmado` · `no_disponible`.
`expires_at_formatted` se formatea en `es-MX` / `America/Mexico_City`.

**Todos los desenlaces de negocio devuelven `200`**, incluido `not_found`. El `400` se reserva para fallos de parseo. Es deliberado: quien consume esto reacciona al campo `status`, no al código HTTP.

### `POST /api/backoffice/contracts/[contractRequestId]/regenerate-link`
### `POST /api/backoffice/contracts/[contractRequestId]/retry`

Acciones operativas desde el backoffice. El body se ignora. Ambas delegan en `runBackofficeContractAction` con acción `regenerate_expired` y `retry` respectivamente.

```json
{ "ok": true, "status": "link_regenerated", "message": "…",
  "request_id": "uuid", "attempt_id": "uuid",
  "link_easylex": "https://…", "expires_at": "…" }
```

`status` ∈ `link_regenerated` · `link_reused` · `already_signed` · `not_found`.
`404` cuando el status es `not_found`, `200` en el resto, `500` ante excepción.

`link_reused` significa que el link vigente todavía sirve y no se generó uno nuevo — no es un error.

---

## Webhooks

Los tres son públicos por estar bajo `/api/webhooks/`.

### `GET /api/webhooks/whatsapp`
Verificación de Meta. Query: `hub.mode`, `hub.verify_token`, `hub.challenge`. Devuelve el challenge en texto plano con `200` si el token coincide, `403 {"error":"Forbidden"}` si no.

### `POST /api/webhooks/whatsapp`
Eventos de Meta. Body `{ object, entry: WebhookEntry[] }`. Actualiza `delivered_at`, `read_at` y `error_message` en `whatsapp_contract_messages` buscando por `wa_message_id`, y llama al RPC `increment_bulk_send_counter` con `delivered_count` o `read_count`.

Responde a mensajes entrantes **solo** si `WHATSAPP_DEBUG_AUTO_REPLY === "true"`.

`200 {"ok":true}` / `500 {"ok":false}`.

**Autenticación:** se verifica la cabecera `X-Hub-Signature-256` mediante HMAC-SHA256 sobre el **cuerpo crudo** con `WHATSAPP_APP_SECRET`, comparando en tiempo constante (`verifyMetaSignature` en `src/lib/security/webhook-signatures.ts`). Firma ausente o inválida → `401`.

Sin `WHATSAPP_APP_SECRET` configurado, en producción se rechaza (`401`); fuera de producción se permite y se registra `whatsapp.webhook.signature_check_skipped`, para poder probar con túneles y payloads simulados.

> El handler lee `await request.text()` y parsea el JSON después. **No lo cambies a `request.json()`**: la firma se calcula sobre los bytes exactos y un JSON reserializado nunca valida.

### `POST /api/webhooks/easylex/sign`
Webhook real de firma.

**Autenticación:** cabecera `x-easylex-signature` comparada en **tiempo constante** contra `EASYLEX_WEBHOOK_SECRET` (`verifySharedSecret`). Diferencia o ausencia → `401`.

Sin secreto configurado, en producción se rechaza (`401`, log `easylex.webhook.secret_missing`); fuera de producción se permite con log `easylex.webhook.signature_check_skipped`.

Payload (`EasyLexWebhookPayload`): `webhookId`, `url`, `eventType`, `createdAt`, `trigger`, y `data` con `id`, `documentId`, `firstName`, `lastName`, `motherLastName`, `email`, `hasSigned`, `signedAt`, `name`, `status`, `signatories[]`.

Despacha por `eventType`:

| `eventType` | Qué hace | Busca por |
|---|---|---|
| `SIGNED_BY_USER` | Solo registra una fila en `easylex_events` | `data.documentId` |
| `DOCUMENT_SIGNED` | Marca `contract_attempts` → `firmado`, `contract_requests` → `firmado`, `advance_offers` → `firmada`; inserta `audit_events` (`contract.signed`) y `integration_logs` | **`data.id`** |

Los dos manejadores buscan el intento por campos distintos (`documentId` vs `id`); no es un error tipográfico, refleja la forma real del payload de EasyLex en cada evento.

**Idempotencia:** `recordEasyLexEvent` descarta el evento si ya existe una fila con el mismo `event_id`. Cuando falta `webhookId`, el id se sintetiza como `webhook_{attemptId}_{Date.now()}` — que **nunca colisiona**, así que en ese caso la protección de idempotencia no aplica.

**Siempre devuelve `200 {"ok":true}`**, incluso ante errores capturados. Es intencional: evita que EasyLex reintente indefinidamente. El precio es que un fallo de procesamiento no es visible desde EasyLex, solo en `integration_logs`.

### `POST /api/webhooks/easylex/mock-sign`
Simula una firma para pruebas. **Deshabilitado en producción**: responde `404` sin cuerpo, como si la ruta no existiera (`404` en vez de `403` para no revelar que el endpoint existe).

Fuera de producción **no tiene autenticación de ningún tipo** y permite marcar cualquier contrato como firmado. Es aceptable solo porque nunca se expone en un entorno real.

Body (snake o camelCase): `attempt_id`/`attemptId`, `easylex_contract_id`/`easylexContractId`, `event_id`/`eventId`, `signed_at`/`signedAt`. Requiere al menos un identificador de intento o contrato.

```json
{ "ok": true, "status": "signed", "message": "…", "contract_request_id": "uuid",
  "attempt_id": "uuid", "easylex_contract_id": "…", "signed_at": "…" }
```

`status` ∈ `signed` · `already_signed` · `not_found` · `invalid_request`. `404` si `not_found`, `400` si falla el parseo, `200` en el resto.

El bloqueo se hace con `isProduction()` al inicio del handler, antes de leer el body.

---

## WhatsApp — envío

### `POST /api/whatsapp/bulk?action=send|validate`
`action` por defecto es `send`.

```json
{ "mode": "import", "importId": "uuid", "templateName": "adelanto_nomina_v2",
  "buttonConfig": { "text": "Solicitar", "url": "https://…" } }
```

Validaciones manuales, cada una devuelve `400`: `mode` requerido y dentro del enum; `importId` obligatorio si `mode === "import"`; `employeeIds` no vacío si `mode === "manual"`.

`action=validate` — no envía nada:
```json
{ "ok": true, "total": 50, "eligible": 43, "employees": [ /* EmployeeEligibility[] */ ] }
```

`action=send` en modo **inline** (por defecto):
```json
{ "ok": true, "bulkSendId": "uuid", "status": "completed",
  "total": 50, "eligible": 43, "sent": 41, "failed": 2,
  "errors": [{ "employeeId": "uuid", "rfc": "…", "error": "…" }] }
```

`action=send` con la **cola activada**:
```json
{ "ok": true, "bulkSendId": "uuid", "status": "queued",
  "total": 50, "eligible": 43, "sent": 0, "failed": 0, "queued": 43, "errors": [] }
```

Con `status: "queued"`, `sent` y `failed` valen 0 porque los mensajes aún no se han enviado: hay que consultar `GET /api/whatsapp/bulk/detail?id=<bulkSendId>` para el avance real. Ver [WhatsApp](whatsapp.md#cola).

Envía en lotes de **100** con **1 s** de pausa entre lotes. Al terminar reconsulta la base y **sobrescribe los contadores en memoria** si no coinciden, dejando el log `whatsapp.bulk_send.count_mismatch`. Si la tasa de error supera el 10 % emite un `WARN`.

### `GET /api/whatsapp/bulk/history`
Query: `page` (≥1, default 1), `pageSize` (default 20, acotado 1–100), `status`, `mode`, `dateFrom`, `dateTo` (se le suma un día para que sea inclusivo).

```json
{ "ok": true, "data": [ /* whatsapp_bulk_sends */ ], "total": 87,
  "page": 1, "pageSize": 20, "totalPages": 5 }
```

El error `PGRST103` de Postgrest (rango fuera de alcance) se absorbe y devuelve una página vacía con `200`, en lugar de un error.

### `GET /api/whatsapp/bulk/detail`
Query: `id` (**obligatorio**, si falta `400`), `page`, `pageSize` (default 50, acotado 1–200), `status` (filtra `delivery_status`), `q` (ILIKE sobre `employees.rfc`).

```json
{ "ok": true, "bulkSend": { }, "messages": [
    { "id": "uuid", "employee_id": "uuid", "nombre": "…", "apellidos": "…",
      "rfc": "…", "telefono": "…", "delivery_status": "delivered",
      "status": "sent", "error_message": null, "created_at": "…", "wa_message_id": "wamid…" }
  ], "total": 43, "page": 1, "pageSize": 50, "totalPages": 1 }
```

`404` si no existe el envío. Emite `whatsapp.bulk_detail.inconsistent_data` cuando `sent_count > 0` pero no devuelve mensajes.

---

## WhatsApp — consulta

### `GET /api/whatsapp/stats`
Sin parámetros.
```json
{ "ok": true,
  "stats": { "sentToday": 120, "deliveryRate": 94.2, "errorsToday": 3, "totalDelivered": 113 },
  "recent": [ /* 20 últimos, con nombre/apellidos/rfc del empleado */ ] }
```
`deliveryRate` = delivered ÷ (sent + delivered + read) × 100.

### `GET /api/whatsapp/messages/employee`
Query: `employeeId` (obligatorio, `400` si falta). Devuelve los últimos 50 mensajes del empleado.

### `GET /api/whatsapp/employees/search`
Query: `q` (devuelve array vacío con menos de 2 caracteres), `limit` (default 10, tope 25). Busca sobre `nombre`, `apellidos`, `rfc` y `telefono_normalizado`; el monto sale de la oferta `is_current`.

El término se entrecomilla con `escapePostgrestValue` antes de construir el filtro `.or()`. Sin eso, un `,` o un `.` en la búsqueda (por ejemplo "Pérez, Juan") altera la estructura del filtro de PostgREST y devuelve un `500`.

### `GET /api/whatsapp/imports`
Query opcional `importId`. Con él devuelve `{ ok, employees }`; sin él, `{ ok, imports }` con las importaciones recientes (solo las de estado `aplicada`).

---

## WhatsApp — configuración

### `GET /api/whatsapp/config`
Lee de la tabla `settings` las claves `whatsapp_phone_number_id`, `whatsapp_business_number` y `whatsapp_webhook_verify_token`.
```json
{ "ok": true, "config": { }, "envValid": true, "envErrors": [] }
```

### `POST /api/whatsapp/config`
Rol `admin`. Body: `phone_number_id`, `business_number`, `webhook_verify_token`. Hace upsert en `settings` por `key`.

**`access_token` y `app_secret` ya no se guardan.** Si llegan en el cuerpo se ignoran, se registra `whatsapp.config.secret_rejected` y la respuesta lo indica:

```json
{ "ok": true, "ignoredSecrets": ["access_token"],
  "warning": "El access token y el app secret no se guardan en base de datos. …" }
```

Antes se almacenaban sin cifrar en `settings`, legibles por cualquier sesión autenticada — y como las variables de entorno tienen precedencia, el valor guardado a menudo ni se usaba. Van en `WHATSAPP_ACCESS_TOKEN` y `WHATSAPP_APP_SECRET`.

### `POST /api/whatsapp/test`
Body: `{ access_token?, phone_number_id? }` — si faltan, el cliente cae a las variables de entorno. Devuelve `{ ok, phoneNumber, displayName }`; `400` si Meta responde error.

### `GET /api/whatsapp/templates`
`{ ok, templates: StoredTemplate[] }` desde la tabla local.

### `POST /api/whatsapp/templates/sync`
Sin body. Trae hasta 100 plantillas desde Meta y hace upsert por `meta_template_id`. `{ ok, synced, templates }`; `400` si faltan credenciales o `WHATSAPP_BUSINESS_ACCOUNT_ID`.

---

## WhatsApp — auditoría de teléfonos

### `GET /api/whatsapp/phone-audit`
Sin parámetros. Clasifica el teléfono de todos los empleados.

```json
{ "ok": true, "total": 1200, "ok_count": 1150, "issues": 50,
  "by_issue": { "long_distance": 30, "missing_prefix": 20 },
  "rows": [{ "employee_id": "uuid", "nombre": "…", "apellidos": "…", "rfc": "…",
             "empleador": "…", "telefono_normalizado": "5218112345678",
             "issue": "ok", "suggested_fix": null }] }
```

`issue` ∈ `ok` · `long_distance` · `missing_prefix` · `has_plus` · `too_short` · `too_long` · `null_or_empty`.

### `POST /api/whatsapp/phone-audit/fix`
Body: `{ "fixes": [{ "employee_id": "uuid", "telefono_normalizado": "5218112345678" }] }`. Vacío o no-array → `400`.

Cada entrada debe quedar en 10–15 dígitos tras quitar no-numéricos; si no, cuenta como error. Actualiza empleado por empleado (**sin transacción**: un fallo a mitad deja el lote parcialmente aplicado) y, si arregló al menos uno, inserta un único `audit_events` `phone_audit.bulk_fix` con `entity_id: "bulk"`.

`{ ok: true, fixed: 48, errors: 2 }`.

> A pesar del comentario en el código, el endpoint **no verifica que el valor enviado sea el que sugirió el auditor**: acepta cualquier número que pase el filtro de longitud.

---

## Workers de cola

### `POST /api/tasks/whatsapp/send-message`
Envía un único mensaje de un envío masivo. Lo invoca Google Cloud Tasks, no un navegador.

**Autenticación:** token OIDC firmado por Google en `Authorization: Bearer`, validando firma, `audience` (la URL exacta del worker) y que la service account coincida con `TASKS_INVOKER_SERVICE_ACCOUNT`. Fuera de producción se acepta además `x-tasks-secret`; en producción no, porque un secreto estático no caduca ni se rota.

```json
{ "bulkSendId": "uuid", "messageId": "uuid", "templateName": "adelanto_nomina_v2" }
```

```json
{ "ok": true, "status": "sent", "messageId": "uuid" }
```

`status` ∈ `sent` · `failed` · `skipped` (este último cuando la tarea ya se había procesado).

Los códigos de respuesta están elegidos según cómo reaccione Cloud Tasks: `200` completa la tarea, `400` y `401` la descartan sin reintento, y `500` provoca reintento con backoff. Un rechazo de Meta devuelve `200` a propósito — ya quedó registrado como `failed` y reintentar arriesgaría un doble envío.

---

## Rutas fuera de `/api`

| Ruta | Método | Qué hace |
|---|---|---|
| `/auth/callback` | `GET` | Canjea el `code` de OAuth por sesión. Guarda contra open-redirect: `next.startsWith("/") ? next : "/"` |
| `/auth/logout` | `POST` | Solo POST, como mitigación de CSRF (documentado en el archivo). `signOut()` y redirect `303` a `/login` |
| `/firmar/[signerId]` | `GET` (página) | Redirige a `${EASYLEX_SIGNING_LINK_BASE_URL}/{signerId}`, con `https://widgetsandbox.easylex.com/firmar` por defecto |

**Server actions** (`"use server"`), solo dos archivos:

- `src/app/contracts/actions.ts` — `regenerateContractLinkAction` y `retryContractFlowAction`. Leen `contract_request_id` y `employee_id` del form, revalidan `/` y `/contracts/{employeeId}`, y redirigen con `?action_status={status}`.
- `src/app/login/actions.ts` — `signInWithGoogle`, con `redirectTo` a `${NEXT_PUBLIC_APP_URL}/auth/callback` y `prompt: "select_account"`.

---

## Convenciones observadas

Vale la pena conocerlas antes de añadir endpoints, porque son consistentes:

- **El estado de negocio va en el body, no en el HTTP.** `request-contract` devuelve `200` incluso con `not_found`.
- **Los webhooks siempre responden `200`** para evitar reintentos del proveedor.
- **Los errores se devuelven en español**, orientados al operador.
- **La validación va en el borde con Zod**, antes del `try/catch`: un `400` de validación nunca debe salir del bloque que captura errores de servidor.
- **No hay módulo de auditoría.** Seis archivos declaran su propio `createAuditEvent` privado, e igual ocurre con `createIntegrationLog`. Añadir un evento nuevo implica copiar el helper.

Ver también: [Base de datos](base-de-datos.md) · [WhatsApp](whatsapp.md) · [EasyLex y contratos](easylex-contratos.md) · [Configuración](configuracion.md)
