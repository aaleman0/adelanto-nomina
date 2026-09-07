# WhatsApp Cloud API

Integración directa con la API de Meta. Sirve tanto de referencia técnica como de guía de operación.

> El sistema usó ManyChat en una etapa anterior. Se retiró por completo. Quedan rastros en el esquema (`integration_provider` incluye `manychat`, `contract_requests.requested_from` tiene default `'manychat'`), documentados en [Base de datos](base-de-datos.md#deudas-conocidas-del-esquema).

## Configuración

### Prerequisitos en Meta

- Cuenta de Meta Business verificada.
- App de tipo Business en [Meta for Developers](https://developers.facebook.com).
- Número registrado en WhatsApp Business Platform (puede ser de prueba en desarrollo).
- Plantillas aprobadas por Meta.

### Credenciales

Dos vías, y **las variables de entorno tienen precedencia** sobre lo guardado en base:

**Variables de entorno** — recomendado. Ver [Configuración](configuracion.md).

**UI del backoffice** — `Ajustes → Conexión` (`/settings/whatsapp`), requiere rol `admin`. Escribe en `settings` vía `POST /api/whatsapp/config`.

> La UI ya **no acepta** el access token ni el app secret: se guardaban en texto plano y las variables de entorno tienen precedencia de todas formas. Solo se configuran por entorno.

### Verificar que está bien configurado

```bash
curl https://tu-dominio.com/api/health
curl https://tu-dominio.com/api/health/whatsapp
```

El segundo comprueba además que existan las cuatro tablas `whatsapp_*`. También hay un script:

```bash
pnpm exec tsx scripts/verify-whatsapp-setup.ts   # requiere el servidor dev corriendo
```

## Webhook de Meta

### Configurarlo

1. Meta for Developers → WhatsApp → Configuración → Webhooks.
2. URL de callback: `https://tu-dominio.com/api/webhooks/whatsapp`
3. Verify Token: el mismo valor de `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.
4. Suscribirse al campo **messages**.
5. Verificar y guardar.

Comprobación manual:

```bash
curl "https://tu-dominio.com/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=TU_TOKEN&hub.challenge=12345"
# debe responder: 12345
```

En desarrollo local hace falta un túnel público (ngrok o equivalente); `localhost` no sirve.

### Qué hace al recibir eventos

Busca el mensaje por `wa_message_id` y actualiza `delivered_at`, `read_at` o `error_message` en `whatsapp_contract_messages`, además de incrementar los contadores del envío masivo vía el RPC `increment_bulk_send_counter`.

Solo responde a mensajes entrantes si `WHATSAPP_DEBUG_AUTO_REPLY === "true"`.

### Seguridad del webhook

Cada evento se verifica con HMAC-SHA256 sobre el cuerpo crudo usando `WHATSAPP_APP_SECRET`, comparado en tiempo constante. Un payload sin firma o con firma inválida recibe `401` y no se procesa.

En producción, **si `WHATSAPP_APP_SECRET` no está configurado el webhook rechaza todo**. Es deliberado: sin secreto no hay forma de distinguir un evento de Meta de uno falsificado. Fuera de producción se permite y queda el log `whatsapp.webhook.signature_check_skipped`.

## Plantillas

Las plantillas se aprueban en Meta y se cachean localmente en `whatsapp_templates`.

| Acción | Cómo |
|---|---|
| Sincronizar desde Meta | `Ajustes → Plantillas` o `POST /api/whatsapp/templates/sync` |
| Listar las guardadas | `GET /api/whatsapp/templates` |

La sincronización trae hasta 100 plantillas y hace upsert por `meta_template_id`. Requiere `WHATSAPP_BUSINESS_ACCOUNT_ID`.

### Plantilla por defecto

`adelanto_nomina_v2`, con **3 variables de cuerpo**: nombre, empleador, monto.

Existe una plantilla legada `adelanto_nomina` con solo 2 variables. El código distingue entre ambas.

Si `WHATSAPP_TEMPLATE_HEADER_IMAGE_URL` está definida **y** la plantilla es `adelanto_nomina_v2`, se añade un componente de cabecera con imagen.

El idioma está fijo en `es_MX` y la versión de la Graph API en `v18.0`, ambos hardcodeados en `src/lib/whatsapp/client.ts`.

### Categoría de plantilla y entrega (importante)

Meta **acepta** un envío (devuelve `message_status: accepted` y un `wamid`) pero puede **no entregarlo** sin dar error. La causa más común aquí:

- **MARKETING** (`adelanto_nomina_v2`, `adelanto_nomina`) → a un contacto **frío** de un negocio **sin verificar**, Meta filtra la entrega en silencio. No llega y no hay error.
- **UTILITY** (`adelanto_contrato_listo`) → entrega de forma fiable, aunque el negocio no esté verificado. Es la categoría correcta para lo transaccional (el link de firma).

Dos formas de que un mensaje llegue sin depender de la verificación:

1. **Ventana de 24 h.** Si el empleado le escribe primero al número del negocio, se abre una ventana de 24 h en la que hasta el marketing suele entregarse (y se puede enviar texto libre).
2. **Usar una plantilla UTILITY.**

**El pendiente de fondo para el outreach masivo en frío** es completar la **verificación del negocio** en Meta Business Settings (`business_verification_status: pending_submission` mientras no se haga). Eso destraba la entrega de marketing a contactos que nunca han escrito.

Diagnóstico rápido de "no llega": consultar el estado del número/WABA/plantilla con la Graph API (`GET /{PHONE_NUMBER_ID}`, `GET /{WABA_ID}?fields=business_verification_status`, `GET /{WABA_ID}/message_templates`). Un token caducado da código 190; una entrega filtrada no da error.

## Elegibilidad

Antes de enviar, `validateEligibility()` comprueba, en este orden, y devuelve la primera razón que falle:

| Razón (texto literal) | Significado |
|---|---|
| `Sin oferta vigente` | no hay oferta con `is_current = true` |
| `Oferta no elegible` | `is_eligible = false` |
| `Oferta rechazada` | la oferta está en estado `rechazada` |
| `Oferta ya en estado: {status}` | la oferta ya avanzó (`solicitada`, `firmada`…) |
| `Sin cuenta bancaria activa` | no hay `employee_bank_accounts` con `is_active = true` |

Un empleado sin CLABE activa **no recibe mensaje**, aunque su oferta sea válida.

## Envío masivo

### Desde la UI

`WhatsApp → Nuevo envío` (`/whatsapp/send`) es un asistente de **4 pasos** (la UI muestra "Paso X de 4") — **Destinatarios → Mensaje → Revisión → Confirmación** — más una **pantalla de Resultado** al final.

1. Elegir modo: **por importación** (empleados de un lote CSV aplicado) o **manual** (búsqueda y selección individual).
2. Elegir o renombrar la plantilla.
3. Revisar: se valida elegibilidad y se muestra el conteo, con posibilidad de deseleccionar.
4. Confirmar en el modal.
5. Ver el resultado con enviados y fallidos.

Solo aparecen como origen las importaciones en estado `aplicada`.

El operador no configura el botón ni el link. Si la plantilla tiene botón URL dinámico, el backend genera o reutiliza el contrato de cada empleado y manda a Meta el sufijo del link correspondiente.

### Desde la API

Validar sin enviar:

```bash
curl -X POST "https://tu-dominio.com/api/whatsapp/bulk?action=validate" \
  -H "Content-Type: application/json" \
  -d '{"mode":"import","importId":"uuid-de-la-importacion"}'
```

Enviar:

```bash
curl -X POST "https://tu-dominio.com/api/whatsapp/bulk" \
  -H "Content-Type: application/json" \
  -d '{"mode":"import","importId":"uuid","templateName":"adelanto_nomina_v2"}'
```

Ambos requieren cookie de sesión — no hay API key. Contrato completo en [API](api.md#whatsapp--envío).

### Cómo se ejecuta

Hay dos modos de transporte, elegidos por configuración. El código de negocio es el mismo: ambos construyen el mensaje con `buildBulkTemplateMessage`.

| | **Inline** (por defecto) | **Cola** (Cloud Tasks) |
|---|---|---|
| Cuándo | Sin configuración de GCP | Con las 4 variables de Cloud Tasks |
| Ejecución | Dentro del request HTTP | Una tarea por mensaje |
| Límite de velocidad | `sleep(1000)` entre lotes de 100 | `maxDispatchesPerSecond` de la cola |
| Reintentos | Ninguno | Backoff exponencial por mensaje |
| Respuesta | `status: "completed"` con contadores reales | `status: "queued"`, contadores en 0 |
| Riesgo | Timeout con lotes grandes | — |

#### Inline

Lotes de **100** mensajes con **1 segundo** de pausa (`BATCH_SIZE`, `BATCH_DELAY_MS`). Mil empleados tardan unos 10 segundos.

Al terminar reconsulta la base y **sobrescribe los contadores en memoria** si no coinciden, dejando el log `whatsapp.bulk_send.count_mismatch`.

> El envío ocurre dentro del request HTTP. Un lote grande puede toparse con el timeout del entorno de despliegue. Es la razón de existir del modo cola.

#### Cola

1. `POST /api/whatsapp/bulk` valida elegibilidad y crea el `whatsapp_bulk_sends`.
2. Crea por adelantado una fila en `whatsapp_contract_messages` por destinatario, en estado `queued`, con un **snapshot** del empleado en `metadata`.
3. Encola una tarea por mensaje y responde de inmediato con `status: "queued"`.
4. Cloud Tasks invoca `POST /api/tasks/whatsapp/send-message` por cada tarea.
5. El worker reclama la fila (`queued` → `sending`) y envía.
6. Cuando no quedan filas pendientes, el envío pasa a `completed`.

**Idempotencia.** Cloud Tasks garantiza entrega *al menos una vez*. El worker reclama la fila con un `UPDATE ... WHERE status = 'queued'`, que Postgres resuelve bajo un único bloqueo: solo un intento gana, el resto sale por `skipped` sin volver a llamar a Meta. Además el nombre de la tarea es el id del mensaje, así que reencolar tampoco duplica.

**El snapshot importa**: el worker no vuelve a consultar al empleado, así que un cambio de datos a mitad del envío no altera mensajes ya encolados.

**Códigos de respuesta del worker**, porque determinan si la cola reintenta:

| Situación | Código | Efecto |
|---|---|---|
| Enviado, ya procesado, o rechazado por Meta | `200` | Tarea completada |
| Autenticación inválida | `401` | Sin reintento |
| Payload inválido | `400` | Sin reintento |
| Error inesperado (base caída, timeout) | `500` | Reintento con backoff |

Un rechazo de Meta devuelve `200` a propósito: ya quedó registrado como `failed` y reintentarlo arriesgaría enviarlo dos veces.

**Seguridad del worker.** `/api/tasks/*` queda fuera del gate de sesión porque quien llama es una máquina sin cookie. Se autentica con el token OIDC que firma Cloud Tasks, validando firma, `audience` y service account. Fuera de producción se acepta además la cabecera `x-tasks-secret`; en producción, no.

> **Pendiente:** con la cola activa, la pantalla de resultado muestra 0 enviados porque la respuesta es inmediata. Falta que consulte el detalle del envío periódicamente. Con el modo inline (por defecto) no aplica.

#### Configurar la cola

```bash
gcloud tasks queues create whatsapp-bulk \
  --location=us-central1 \
  --max-dispatches-per-second=10 \
  --max-concurrent-dispatches=20 \
  --max-attempts=5 \
  --min-backoff=10s \
  --max-backoff=300s

gcloud iam service-accounts create cloud-tasks-invoker

gcloud run services add-iam-policy-binding <servicio> \
  --member=serviceAccount:cloud-tasks-invoker@<proyecto>.iam.gserviceaccount.com \
  --role=roles/run.invoker
```

`--max-dispatches-per-second` es el límite real hacia Meta: ajústalo a la cuota de tu número. Después, definir las variables `GCP_PROJECT_ID`, `CLOUD_TASKS_QUEUE`, `TASKS_WORKER_BASE_URL` y `TASKS_INVOKER_SERVICE_ACCOUNT`. Ver [Configuración](configuracion.md).

Para volver al modo inline sin desmontar nada: `QUEUE_DRIVER=inline`.

## Historial y seguimiento

`WhatsApp → Historial` (`/whatsapp/history`) lista los envíos con filtros por estado (`pending`, `sending`, `completed`, `failed`), modo (`import`, `manual`) y rango de fechas. Al abrir un envío se ve el detalle por destinatario, con búsqueda por RFC.

### Estados de entrega

| Estado | Significado |
|---|---|
| `sent` | Meta aceptó el mensaje y está en cola de entrega |
| `delivered` | llegó al dispositivo |
| `read` | el destinatario lo abrió |
| `failed` | no se pudo entregar |

`delivered` y `read` se actualizan solos vía webhook. Si nunca pasan de `sent`, el webhook no está llegando.

> Filas migradas desde ManyChat pueden guardar estados en español (`enviado`, `entregado`, `click`) mientras el código nuevo escribe en inglés. Las vistas de backoffice aceptan ambos vocabularios; una consulta directa a la tabla debe contemplarlo.

## Auditoría de teléfonos

`Ajustes → Auditoría de teléfonos` (`/settings/whatsapp/phone-audit`) clasifica el teléfono de todos los empleados. Formato objetivo: **`521` + 10 dígitos = 13 dígitos**.

| Problema | Descripción |
|---|---|
| `ok` | correcto |
| `long_distance` | tiene `52` pero le falta el `1` de celular |
| `missing_prefix` | sin código de país |
| `has_plus` | incluye `+` |
| `too_short` / `too_long` | longitud fuera de rango |
| `null_or_empty` | sin dato |

La corrección masiva actualiza empleado por empleado **sin transacción**: si falla a mitad, el lote queda parcialmente aplicado. Se registra un único `audit_events` `phone_audit.bulk_fix`.

## Monitoreo

`GET /api/health` reporta `errorRate24h` y pone `alerting: true` si supera el 10 %.

Cuando un envío masivo termina con más del 10 % de fallos, se emite un log `WARN`:

```json
{ "level": "WARN", "event": "whatsapp.bulk_send.high_error_rate",
  "bulkSendId": "…", "errorRate": 25, "sent": 75, "failed": 25,
  "totalAttempted": 100, "threshold": 10 }
```

Eventos útiles para alertar en una plataforma de logs externa: `whatsapp.bulk_send.high_error_rate`, `health.whatsapp.high_error_rate`, `whatsapp.bulk_send.count_mismatch`, `whatsapp.bulk_detail.inconsistent_data`.

## Problemas frecuentes

**"WhatsApp no está configurado"** — faltan `WHATSAPP_ACCESS_TOKEN` o `WHATSAPP_PHONE_NUMBER_ID`. Revisar `GET /api/health/whatsapp`, que indica exactamente cuál falta.

**El webhook no se verifica** — el `hub.verify_token` de Meta no coincide con `WHATSAPP_WEBHOOK_VERIFY_TOKEN`. Suele ser un espacio de más al copiar.

**Los mensajes nunca pasan de `sent`** — el webhook no está configurado, apunta mal, o el servidor no es accesible públicamente.

**"Número inválido"** — el teléfono no está en formato `521XXXXXXXXXX`. Usar la auditoría de teléfonos.

**Tasa de error alta tras un envío** — verificar que el Access Token no haya expirado, revisar `error_message` por empleado en el detalle del envío, y descartar límite de tasa de Meta.

**El empleado no aparece como elegible** — casi siempre falta la cuenta bancaria activa o la oferta ya avanzó de estado. Ver la razón exacta en la respuesta de `?action=validate`.

Ver también: [API](api.md) · [EasyLex y contratos](easylex-contratos.md) · [Configuración](configuracion.md)
