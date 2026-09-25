# API

Fuente única de los endpoints. Todas las rutas viven en `src/app/api/` y declaran `export const runtime = "nodejs"`.

## Autenticación

El gate está en `src/proxy.ts` (convención `proxy` de Next.js 16 — **no existe `src/middleware.ts`**). Toda petición requiere una cookie de sesión de Supabase Auth salvo:

| Excepción | Valor |
|---|---|
| Rutas públicas | `/login`, `/auth/callback` |
| Prefijos de página pública | `/solicitar/`, `/firmar/` |
| Prefijos de API públicos | `/api/webhooks/`, `/api/health/`, `/api/tasks/` |
| Rutas de API públicas exactas | `/api/health` |

`/api/health` se lista como ruta exacta y no como prefijo a propósito: así un futuro `/api/health-xyz` no queda público por accidente. Los sub-endpoints (`/api/health/whatsapp`) entran por el prefijo `/api/health/`.

`/solicitar/` y `/firmar/` son pantallas del EMPLEADO, que no tiene cuenta en el backoffice: su autenticación es el identificador imposible de adivinar que viaja en la URL —un token HMAC firmado con `SOLICITAR_TOKEN_SECRET` en un caso, el `signerId` que EasyLex emite por contrato en el otro—, no una cookie. Sin esta excepción, el enlace de firma que se guarda como `signing_url` mandaba al empleado a `/login`, donde nunca podrá entrar.

Los prefijos públicos no son rutas abiertas: cada una se autentica por su cuenta —los webhooks por firma HMAC o secreto compartido, y los workers de `/api/tasks/` por el token OIDC de Cloud Tasks—. Quedan fuera del gate de sesión porque quien las llama es una máquina sin cookie de navegador.

No hay API keys: una integración máquina-a-máquina contra estos endpoints no es posible sin una cookie de sesión válida. Las únicas excepciones son los webhooks y los workers de cola, que se autentican por firma o token OIDC.

## Autorización por rol

Sobre la sesión se aplica RBAC con `requireRole()` (`src/lib/auth/roles.ts`). Los roles son acumulativos: `solo_lectura` < `operaciones` < `admin`.

| Endpoint | Rol mínimo |
|---|---|
| `GET /api/whatsapp/stats` · `bulk/history` · `bulk/detail` · `imports` · `messages/employee` · `templates` | `solo_lectura` |
| `POST /api/whatsapp/bulk?action=validate` | `solo_lectura` |
| `GET /api/whatsapp/employees/search` y `GET /api/whatsapp/phone-audit` | `operaciones` |
| `GET /api/cycles/[cycleId]/export` | `operaciones` |
| `GET /api/backoffice/contracts/[id]/signed-pdf` | `operaciones` |
| `POST /api/whatsapp/bulk` (envío) | `operaciones` |
| `POST /api/whatsapp/request-contract` | `operaciones` |
| `POST /api/imports` y `.../apply` | `operaciones` |
| `POST /api/backoffice/contracts/*` (incluido `batch`) | `operaciones` |
| `GET` y `POST /api/whatsapp/config` | `admin` |
| `GET` y `POST /api/settings/company` | `admin` |
| `POST /api/whatsapp/templates` (fija la plantilla de oferta) | `admin` |
| `POST /api/whatsapp/templates/sync` | `admin` |
| `POST /api/whatsapp/phone-audit/fix` | `admin` |
| `POST /api/whatsapp/test` | `admin` |

**No hay una regla "todo `GET` es `solo_lectura`".** El rol se decide por lo que la respuesta expone, no por el método: un `GET` que devuelve PII por persona (búsqueda de empleados, auditoría de teléfonos), el Excel de dispersión, el PDF firmado o el webhook verify token exige más.

Las server actions de `src/app/(operacion)/personas/actions.ts` y `src/app/(operacion)/nomina/actions.ts` comprueban `operaciones` por su cuenta, porque **no pasan por `src/proxy.ts`**. La excepción es `src/app/solicitar/[token]/actions.ts`, del empleado: no exige rol porque su autenticación es el token firmado del enlace, y en su lugar revalida la ventana de la oferta.

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

Los esquemas del módulo WhatsApp viven en `src/lib/whatsapp/schemas.ts`, separados de los handlers para poder testearlos sin levantar el servidor. Tres endpoints de una sola forma —`POST /api/backoffice/contracts/batch`, `POST /api/settings/company` y `POST /api/tasks/whatsapp/send-message`— declaran el suyo dentro de su propio handler.

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

`POST /api/whatsapp/bulk` · `GET /api/whatsapp/bulk/history` · `GET /api/whatsapp/bulk/detail` · `GET /api/whatsapp/employees/search` · `POST /api/whatsapp/config` · `POST /api/whatsapp/test` · `POST /api/whatsapp/phone-audit/fix` · `POST /api/backoffice/contracts/batch` · `POST /api/settings/company` · `POST /api/tasks/whatsapp/send-message`

`POST /api/whatsapp/request-contract` conserva su parser propio (`parseRequestContractPayload`), porque acepta alias en snake y camelCase y ya tiene 10 tests unitarios que fijan ese comportamiento.

---

## Health

### `GET /api/health`
Estado general. Público.

Hace ping a Supabase (head-count sobre `settings`), corre `validateWhatsAppEnv()` y `validateEasyLexEnv()`, y calcula la tasa de error de WhatsApp de las últimas 24 h sobre `whatsapp_contract_messages`.

```json
{
  "ok": true,
  "status": "ok",
  "timestamp": "2026-07-20T12:00:00.000Z",
  "services": {
    "supabase": { "ok": true, "configured": true },
    "whatsapp": { "ok": true, "configured": true, "errorRate24h": 0, "alerting": false },
    "easylex": { "ok": true, "configured": true, "sandboxInProd": false }
  }
}
```

Solo señales booleanas: es un endpoint público, así que el mensaje de error de Supabase y las variables que faltan quedan en los logs y no en la respuesta, para no exponer internals a cualquiera.

`sandboxInProd` es un footgun de go-live: en producción, con `EASYLEX_BASE_URL` vacío o apuntando a sandbox, la firma no funciona con la cuenta real. Se marca aquí —y se registra `health.easylex.sandbox_in_prod`— para que el health lo delate en vez de fallar en silencio.

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
  "whatsappConfigured": true,
  "connection": { "ok": true }
}
```

Devuelve `503` **solo** si falla Supabase; que falten variables de entorno no lo marca como caído.

`connection` es la validez REAL del token contra Meta (`testConnection`), no su presencia, cacheada 5 minutos para no golpear la API de Meta en cada poll del banner de salud: el token temporal caduca sin aviso y esto lo detecta antes de un envío. Se prueba con token + phone number, sin exigir `appSecret` (ese solo hace falta para verificar la firma del webhook; gatearlo aquí reportaría "no configurado" en vez del estado real del token). No baja el código HTTP —el servicio sigue `healthy` aunque el token expire— y solo viaja el booleano: el mensaje crudo de Meta queda en el log.

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

`400` si el `batchId` no es un UUID —se comprueba antes del cast a `uuid`, porque un id mal formado daba un `500` en vez de un `400`—; `200` / `500` en el resto.

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
  "expires_at_formatted": "20 de julio de 2026, 14:00",
  "link_enviado": true, "link_reusado": false }
```

`status` ∈ `contract_ready` · `contract_link_failed` · `already_signed` · `not_found` · `not_eligible` · `no_offer` · `invalid_request`.

`link_enviado` dice si el link llegó al empleado por WhatsApp: con `contract_ready` y `link_enviado: false`, el contrato y su enlace existen y lo que falta es reenviarlos, no regenerarlos. `contract_link_failed` es otra cosa: el PDF se generó pero EasyLex no pudo crear el documento de firma, así que no hay link que enviar —el intento queda en `error` y el expediente en la cola para reintentar cuando el proveedor vuelva—. `link_reusado` avisa de que el enlace devuelto ya existía y no se gastó una firma nueva: con enlaces de 24 h ese es el caso normal durante el resto del día, así que quien le escriba a la persona no debe decirle "generamos tu contrato".
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

### `POST /api/backoffice/contracts/batch`

La misma acción, pero sobre todos los expedientes de un estado. Body `{ "status": "link_expirado" | "error" }` (Zod; cualquier otro estado → `400`): el enum se acota aquí para no permitir disparar acciones masivas sobre estados donde no aplican. `link_expirado` → `regenerate_expired`, `error` → `retry`.

Procesa como máximo **25 expedientes por invocación** (`MAX_BATCH_ACTIONS`): cada uno llama a EasyLex, que es lento y externo, y "regenerar los 165 vencidos" excedería el timeout del request. El operador vuelve a pulsar para seguir y la respuesta dice cuántos quedan, así que no hay truncado silencioso. Un fallo individual (EasyLex caído para ese expediente) no aborta la tanda.

```json
{ "ok": true, "status": "link_expirado", "action": "regenerate_expired",
  "totalInStatus": 165, "processed": 25, "succeeded": 23, "skipped": 1,
  "failed": 1, "remaining": 142 }
```

`500` ante excepción. Por ser una acción de alta consecuencia lleva el mismo rate limit que el envío masivo.

### `GET /api/backoffice/contracts/[contractRequestId]/signed-pdf`

Descarga del contrato **firmado archivado**. Busca el último intento con `signed_pdf_path` de esa solicitud y **redirige** a una signed URL de 60 s del bucket privado `contratos-firmados`. Es dato sensible: rol `operaciones`.

`400` si el id no es UUID; `404` cuando todavía no está archivado, con el texto que dice qué hacer (`Usa "Reenviar al empleado" para generarlo`); `500` si falla la búsqueda o la firma de la URL.

### `GET /api/cycles/[cycleId]/export`

**El Excel de dispersión.** Devuelve un `.xlsx` con los empleados que FIRMARON en ese ciclo (lote de importación): nombre, RFC, **monto autorizado** (lo que recibe la persona) y **total a pagar** (con comisión e IVA, lo que se le descuenta de nómina). Son cifras distintas y ambas se necesitan: una para dispersar, otra para el descuento. El total se calcula con `calculateLoanTotals`, la misma función que llena el contrato, para que el Excel y el pagaré que firmó la persona no puedan discrepar.

"Firmó" = la solicitud de contrato de su oferta de ese lote está `firmado` (persiste aunque un ciclo posterior reemplace la oferta). Rol `operaciones`.

El archivo hereda el nombre del que se importó con "- firmados" al final, para que el operador sepa de un vistazo a qué carga corresponde cuando tiene varios ciclos descargados. `500` con `{ error }` si falla la generación.

---

## Webhooks

Los tres son públicos por estar bajo `/api/webhooks/`.

### `GET /api/webhooks/whatsapp`
Verificación de Meta. Query: `hub.mode`, `hub.verify_token`, `hub.challenge`. Devuelve el challenge en texto plano con `200` si el token coincide, `403 {"error":"Forbidden"}` si no.

### `POST /api/webhooks/whatsapp`
Eventos de Meta. Body `{ object, entry: WebhookEntry[] }`. Actualiza `delivered_at`, `read_at` y `error_message` en `whatsapp_contract_messages` buscando por `wa_message_id`, y llama al RPC `increment_bulk_send_counter` con `delivered_count` o `read_count`.

Los mensajes entrantes los atiende el **chatbot** (`handleInboundMessage`): rutea el botón Sí/No y, si no reconoce el mensaje, contesta el fallback. Cada entrante queda anotado en `integration_logs` ligado a su empleado —también cuando el chatbot falla, porque una falla es justo el caso en que la persona se quedó sin respuesta y alguien tiene que verlo en su expediente—. Un error en un mensaje no tumba el resto del lote ni provoca reintentos de Meta: se captura ahí y el webhook responde `200` igual.

Con `WHATSAPP_DEBUG_AUTO_REPLY === "true"` el chatbot se **bypassa** y en su lugar se manda un eco de conectividad.

`200 {"ok":true}` / `500 {"ok":false}`.

**Autenticación:** se verifica la cabecera `X-Hub-Signature-256` mediante HMAC-SHA256 sobre el **cuerpo crudo** con `WHATSAPP_APP_SECRET`, comparando en tiempo constante (`verifyMetaSignature` en `src/lib/security/webhook-signatures.ts`). Firma ausente o inválida → `401`.

Sin `WHATSAPP_APP_SECRET` configurado, en producción —o con `WEBHOOK_ENFORCE_SIGNATURES=true`— se rechaza (`401`); fuera de producción se permite y se registra `whatsapp.webhook.signature_check_skipped`, para poder probar con túneles y payloads simulados. La segunda señal existe porque depender solo de `NODE_ENV` falla ABIERTO: un despliegue real con esa variable mal fijada aceptaría webhooks sin verificar.

> El handler lee `await request.text()` y parsea el JSON después. **No lo cambies a `request.json()`**: la firma se calcula sobre los bytes exactos y un JSON reserializado nunca valida.

### `POST /api/webhooks/easylex/sign`
Webhook real de firma.

**Autenticación:** cabecera `x-easylex-signature`, verificada por `verifyEasylexWebhook` (en `src/lib/security/webhook-signatures.ts`), que acepta **cualquiera de dos esquemas** en tiempo constante contra `EASYLEX_WEBHOOK_SECRET`: (1) secreto compartido plano, o (2) HMAC-SHA256 del **cuerpo crudo** (con prefijo `sha256=` opcional). Se admiten ambos porque no está confirmado cuál usa EasyLex y los dos exigen el secreto. Diferencia o ausencia → `401`. Por eso el handler lee `await request.text()` y parsea después: reserializar el JSON invalidaría el HMAC.

Sin secreto configurado, en producción —o con `WEBHOOK_ENFORCE_SIGNATURES=true`— se rechaza (`401`, log `easylex.webhook.secret_missing`); fuera de producción se permite con log `easylex.webhook.signature_check_skipped`.

Payload (`EasyLexWebhookPayload`): `webhookId`, `url`, `eventType`, `createdAt`, `trigger`, y `data` con `id`, `documentId`, `firstName`, `lastName`, `motherLastName`, `email`, `hasSigned`, `signedAt`, `name`, `status`, `signatories[]`.

Despacha por `eventType`:

| `eventType` | Qué hace | Busca por |
|---|---|---|
| `SIGNED_BY_USER` | Solo registra una fila en `easylex_events` | `data.documentId` |
| `DOCUMENT_SIGNED` | Marca `contract_attempts` → `firmado` y, **solo si la solicitud sigue en curso**, `contract_requests` → `firmado` y `advance_offers` → `firmada`; inserta `audit_events` y `integration_logs`, y entrega el PDF firmado al empleado | **`data.id`** |

Los dos manejadores buscan el intento por campos distintos (`documentId` vs `id`); no es un error tipográfico, refleja la forma real del payload de EasyLex en cada evento.

**Una firma puede llegar sobre una solicitud que ya no está en curso.** Al reemplazar un ciclo se adelanta el `expires_at` del contrato anterior, pero el documento sigue vivo en EasyLex, que no expone forma de cancelarlo. `queHacerConLaFirma` (`src/lib/contracts/firma-tardia.ts`) decide qué hacer con ella: si la solicitud ya no está en curso **no se pisa su estado** —revivirla metería ese pago, con el monto de un ciclo ya cerrado, en el Excel de dispersión y sin aparecer en el tablero—, el `audit_events` se escribe como `contract.signed_fuera_de_curso` en vez de `contract.signed`, se registra un `ERROR` (`easylex.webhook.document_signed.fuera_de_curso`) para que operación lo resuelva, y el PDF solo se archiva como evidencia. En curso, el evento es `contract.signed` y el flujo completo sigue.

**El orden de las escrituras importa.** `contract_attempts.status = 'firmado'` es el guard de idempotencia, así que se marca **al final**, después de request, oferta y auditoría: si alguna de esas falla, el intento queda sin firmar y el reintento de EasyLex recupera el estado en vez de cortocircuitar en el guard. La entrega del contrato firmado va después y es best-effort —nunca lanza—, para que un fallo de entrega no se convierta en un 5xx que haga reintentar una firma ya registrada.

**Idempotencia:** `recordEasyLexEvent` descarta el evento si ya existe una fila con el mismo `event_id`. Cuando falta `webhookId`, el id se sintetiza como `webhook_{attemptId}_{Date.now()}` — que **nunca colisiona**, así que en ese caso la protección de idempotencia no aplica.

**Ante un error de procesamiento devuelve `500`** (no `200`) para que EasyLex **reintente**. Los manejadores son idempotentes (saltan si el intento ya está `firmado` y deduplican por `event_id`), así que un fallo transitorio de BD durante la transición a `firmado` no pierde la confirmación de firma —evidencia legal—. Éxito → `200 {"ok":true}`.

### `POST /api/webhooks/easylex/mock-sign`
Simula una firma para pruebas. **Deshabilitado en producción**: responde `404` sin cuerpo, como si la ruta no existiera (`404` en vez de `403` para no revelar que el endpoint existe).

Fuera de producción **no tiene autenticación de ningún tipo** y permite marcar cualquier contrato como firmado. Es aceptable solo porque nunca se expone en un entorno real.

Body (snake o camelCase): `attempt_id`/`attemptId`, `easylex_contract_id`/`easylexContractId`, `event_id`/`eventId`, `signed_at`/`signedAt`. Requiere al menos un identificador de intento o contrato.

```json
{ "ok": true, "status": "signed", "message": "…", "contract_request_id": "uuid",
  "attempt_id": "uuid", "easylex_contract_id": "…", "signed_at": "…" }
```

`status` ∈ `signed` · `already_signed` · `not_found` · `invalid_request`. `404` si `not_found`, `400` si falla el parseo, `200` en el resto.

El bloqueo se hace al inicio del handler, antes de leer el body, con **doble cerrojo** para no depender de una sola señal: hace falta `ENABLE_MOCK_SIGN="true"` **y** no estar en producción. Así un despliegue con `NODE_ENV` mal fijado no reabre el endpoint por sí solo — y, por lo mismo, en desarrollo responde `404` hasta que se pone la variable.

---

## WhatsApp — envío

### `POST /api/whatsapp/bulk?action=send|validate`
`action` por defecto es `send`.

```json
{ "mode": "import", "importId": "uuid", "templateName": "adelanto_nomina_v2" }
```

Validado con Zod (`BulkSendBodySchema`), cada fallo devuelve `400`: `mode` requerido y dentro del enum (`import` · `manual` · `status`); `importId` obligatorio si `mode === "import"`; `employeeIds` no vacío y con tope de 5000 si `mode === "manual"`; `status` obligatorio si `mode === "status"`.

Hoy el único estado al que se puede enviar en bloque con `mode=status` es `pendiente_envio`, el primer contacto. Ampliarlo con cuidado: reenviar la plantilla inicial a otras etapas del embudo sería incorrecto.

El botón URL de la plantilla no se recibe desde el cliente: el backend genera o reutiliza el contrato por empleado y manda a Meta el sufijo dinámico correcto del link de firma. Si llega un `buttonUrl` legado en el body, se ignora.

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
Query: `id` (**obligatorio**, si falta `400`), `page`, `pageSize` (default 50, acotado 1–200), `status`, `q` (ILIKE sobre `employees.rfc`).

`status` filtra `delivery_status` (`sent` · `delivered` · `read` · `failed` · `pending`) con una excepción: **`queued` no es un valor de la columna.** Es el nombre que la UI le da al `NULL` de un mensaje encolado que el worker todavía no ha tomado, y en la consulta se traduce a `is null`.

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
Query: `employeeId` (obligatorio, `400` si falta; `400` también si no es un UUID, que si no revienta al castearse y sale un `500`).

```json
{ "ok": true, "messages": [ /* 50 últimos enviados */ ], "respuestas": [ /* 50 últimas entrantes */ ] }
```

`respuestas` es **lo que la persona contestó**: vive en `integration_logs` (`provider=whatsapp`, `direction=inbound`, `endpoint=/api/webhooks/whatsapp`), donde el chatbot deja cada entrante ligado a su empleado, y se resume con `resumirRespuesta`. Si esa consulta falla se devuelve `respuestas: null` y **no** una lista vacía: la pantalla no puede afirmar que la persona no contestó cuando en realidad no se pudo leer. Lo enviado sigue siendo evidencia válida, así que el endpoint no falla por eso.

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
`{ ok, templates: StoredTemplate[], offerTemplate }` desde la tabla local. `offerTemplate` viaja junto a la lista para que la pantalla de envío no necesite una segunda petición solo para saber cuál está fijada.

### `POST /api/whatsapp/templates`
Fija qué plantilla se usa para las ofertas. Rol `admin`: cambiarla afecta lo que reciben todos los empleados en el siguiente envío. Body `{ name }`; `400` si falta, y `400` también si el nombre no está entre las plantillas sincronizadas desde Meta —guardar uno que Meta no conoce dejaría el envío roto sin aviso hasta el momento de enviar—. Devuelve `{ ok, offerTemplate }`.

### `POST /api/whatsapp/templates/sync`
Sin body. Trae hasta 100 plantillas desde Meta y hace upsert por `meta_template_id`. `{ ok, synced, templates }`; `400` si faltan credenciales o `WHATSAPP_BUSINESS_ACCOUNT_ID`.

---

## Datos de la empresa

### `GET /api/settings/company` · `POST /api/settings/company`

Los datos del acreedor y los testigos que aparecen en **todos** los contratos. Son constantes: se ponen una vez y el generador del contrato las lee de `company_settings`. Este endpoint es la forma de editarlas sin tocar SQL.

Nueve claves, todas obligatorias en el `POST`: `acreedor_razon_social`, `acreedor_rfc`, `acreedor_representante`, `acreedor_domicilio`, `acreedor_banco`, `acreedor_cuenta`, `acreedor_clabe`, `testigo_1_nombre`, `testigo_2_nombre`. Upsert por `key`; `value` es `NOT NULL`, así que nunca se manda `null`.

El `GET` devuelve `{ ok, config }` con las nueve claves siempre presentes —cadena vacía si no están en base— para que el formulario no tenga que distinguir "falta" de "vacío".

Rol `admin` en los dos métodos. Toda la sección `/ajustes` ya es admin-only por su layout; el endpoint lo exige por su cuenta como defensa en profundidad. `400` si el JSON o los datos no validan, `500` si falla la base.

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

Cada entrada debe quedar en 10–15 dígitos tras quitar no-numéricos; si no, cuenta como error. Actualiza empleado por empleado (**sin transacción**: un fallo a mitad deja el lote parcialmente aplicado) y, si arregló al menos uno, inserta un único `audit_events` `phone_audit.bulk_fix` con `entity_id: null`, el detalle (`fixed`, `errors`, `employee_ids`) en `metadata` y el operador que lo ejecutó. Antes ahí iba la cadena `"bulk"`, y como `entity_id` es `uuid` el insert fallaba en silencio: la corrección quedaba sin rastro.

`{ ok: true, fixed: 48, errors: 2 }`.

> El endpoint **no verifica que el valor enviado sea el que sugirió el auditor**: acepta cualquier número que pase el filtro de longitud.

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
| `/auth/callback` | `GET` | Canjea el `code` de OAuth por sesión. Rechaza las cuentas fuera del allow-list (`isEmailAllowed`) cerrando la sesión recién creada. Guarda contra open-redirect: `next.startsWith("/") ? next : "/"` |
| `/auth/logout` | `POST` | Solo POST, como mitigación de CSRF (documentado en el archivo). `signOut()` y redirect `303` a `/login` |
| `/solicitar/[token]` | `GET` (página) + server action | Auto-servicio del empleado; pública. El token es un HMAC firmado con `SOLICITAR_TOKEN_SECRET`. El contrato se genera en el **POST** (clic del botón), no en el GET, para que el bot de vista previa de WhatsApp no dispare la creación |
| `/firmar/[signerId]` | `GET` (página) | Puente a la firma en EasyLex; pública. Valida el `signerId` contra `contract_attempts` —que exista, que el intento siga en `generado` y que no esté vencido— y solo entonces redirige a `${EASYLEX_SIGNING_LINK_BASE_URL}/{signerId}`. **No hay valor por defecto**: sin esa variable devuelve `404`, porque fallar en voz alta es mejor que redirigir a un dominio muerto. Ya firmado o vencido no redirige: pinta el aviso que explica qué pasó |

**Server actions** (`"use server"`), cuatro archivos:

- `src/app/(operacion)/personas/actions.ts` — `regenerateContractLinkAction`, `retryContractFlowAction`, `requestContractAction` ("Solicitar contrato": el disparador operativo que falta cuando el empleado no arranca el flujo él mismo), `resendSignedContractAction` (reenvía el firmado cuando la entrega automática falló) y `checkSignatureAction` ("Comprobar si ya firmó", la salida cuando el aviso de EasyLex no llega). Leen `contract_request_id` / `employee_id` del form, exigen `operaciones`, revalidan `/` y `/personas/{employeeId}`, y redirigen con `?action_status={status}`.
- `src/app/(operacion)/nomina/actions.ts` — `syncCycleStatusesAction` ("Actualizar estados"): pregunta a EasyLex por los contratos del ciclo y marca los ya firmados. Exige `operaciones` y redirige a `/nomina/{batchId}?action_status={status}&nuevas={n}`.
- `src/app/solicitar/[token]/actions.ts` — `solicitarContratoAction`. **Pública**: la autenticación es el token firmado del enlace, no un rol. Vuelve a evaluar la ventana (`pasoAlPedir`) y la solicitud previa aquí, porque un POST no necesita pasar por la página y esta es la puerta que de verdad genera el contrato.
- `src/app/login/actions.ts` — `signInWithGoogle`, con `prompt: "select_account"` y `redirectTo` al `/auth/callback` del **origen de la petición** (`x-forwarded-proto` / `x-forwarded-host`), dejando `NEXT_PUBLIC_APP_URL` como último recurso: así no depende del valor embebido en el build.

---

## Convenciones observadas

Vale la pena conocerlas antes de añadir endpoints, porque son consistentes:

- **El estado de negocio va en el body, no en el HTTP.** `request-contract` devuelve `200` incluso con `not_found`.
- **Los webhooks devuelven `500` cuando el procesamiento falla**, para que el proveedor **reintente**. Sus manejadores son idempotentes (saltan si el intento ya está `firmado` y deduplican por `event_id`), así que un fallo transitorio de BD no duplica nada; responder `200` a ciegas perdía la confirmación de firma —evidencia legal— en silencio. Lo que no genera reintento es un evento procesado sin incidencias aunque no cambie nada (tipo desconocido, ya firmado, mensaje que el chatbot no pudo atender): eso sí es `200`.
- **Los errores se devuelven en español**, orientados al operador.
- **Las escrituras caras llevan rate limit** (`enforceRateLimit` + `RATE_LIMITS`): importación, envío masivo, solicitud de contrato, acciones de backoffice, acciones de admin de WhatsApp y los dos webhooks. Al pasarse devuelven `429` sin llegar a autenticar, así que es una respuesta posible en todos ellos. Los valores viven en `src/lib/security/rate-limit-config.ts`; el detalle, en [Seguridad](seguridad.md).
- **La validación va en el borde con Zod**, antes del `try/catch`: un `400` de validación nunca debe salir del bloque que captura errores de servidor.
- **Auditoría centralizada.** `src/lib/audit/` expone `recordAuditEvent` y `recordIntegrationLog`; para registrar un evento o log de integración se llaman esos helpers (aplican redacción de PII). Algunos módulos conservan un `createAuditEvent` local como envoltorio delgado sobre `recordAuditEvent`, con los campos fijos de ese flujo.

Ver también: [Base de datos](base-de-datos.md) · [WhatsApp](whatsapp.md) · [EasyLex y contratos](easylex-contratos.md) · [Configuración](configuracion.md)
