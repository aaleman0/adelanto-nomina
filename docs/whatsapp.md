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

**UI del backoffice** — `Ajustes → WhatsApp` (`/ajustes/whatsapp`), requiere rol `admin`. Escribe en `settings` vía `POST /api/whatsapp/config`.

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

Dos cosas distintas, según el evento.

**Estados de entrega:** busca el mensaje por `wa_message_id` y actualiza `delivered_at`, `read_at` o `error_message` en `whatsapp_contract_messages`, además de incrementar los contadores del envío masivo vía el RPC `increment_bulk_send_counter`. Un estado que no encuentra su mensaje deja el log `whatsapp.delivery_status.no_match` en vez de perderse en silencio.

**Mensajes entrantes:** los atiende el **chatbot** (`handleInboundMessage`), que es quien decide la rama Sí/No y genera el contrato. Ver [WhatsApp Chatbot](whatsapp-chatbot.md). Antes de procesar, cada mensaje se guarda en `integration_logs` y se descarta si ya hay uno inbound con el mismo `correlation_id`: Meta reentrega el mismo evento y sin eso se generarían contratos por duplicado.

`WHATSAPP_DEBUG_AUTO_REPLY === "true"` **bypassa el chatbot** y contesta un eco de conectividad. Es solo para comprobar que el webhook llega: con esa variable puesta nadie puede pedir su adelanto por WhatsApp.

### Seguridad del webhook

Cada evento se verifica con HMAC-SHA256 sobre el cuerpo crudo usando `WHATSAPP_APP_SECRET`, comparado en tiempo constante. Un payload sin firma o con firma inválida recibe `401` y no se procesa.

En producción, **si `WHATSAPP_APP_SECRET` no está configurado el webhook rechaza todo**. Es deliberado: sin secreto no hay forma de distinguir un evento de Meta de uno falsificado. Fuera de producción se permite y queda el log `whatsapp.webhook.signature_check_skipped`.

## Plantillas

Las plantillas se aprueban en Meta y se cachean localmente en `whatsapp_templates`.

| Acción | Cómo |
|---|---|
| Sincronizar desde Meta | `Ajustes → Plantillas` (`/ajustes/plantillas`) o `POST /api/whatsapp/templates/sync` |
| Listar las guardadas | `GET /api/whatsapp/templates` |
| Fijar cuál es LA plantilla de ofertas | `Ajustes → Plantillas`, o `POST /api/whatsapp/templates` (rol `admin`); se guarda el nombre en `settings.whatsapp_offer_template` |

Fijar la plantilla de ofertas importa: el portal acumula todas las que Meta aprobó alguna vez —las de prueba, las obsoletas, la de ejemplo— y elegir de una lista larga en el paso del envío ya hizo que los empleados recibieran un enlace roto. Con el ajuste puesto, el paso 2 del envío solo ofrece esa.

La sincronización recorre **todas** las plantillas de la cuenta —páginas de 100, siguiendo `paging.next`— y hace upsert por `meta_template_id`. Requiere `WHATSAPP_BUSINESS_ACCOUNT_ID`.

### Plantilla por defecto

`adelanto_nomina_v2`, con **3 variables de cuerpo**: nombre, empleador, monto.

Cuántas variables y qué componentes lleva el mensaje **se deducen de la plantilla sincronizada**, no de su nombre (`describeTemplateShape`): Meta valida el payload contra la definición aprobada y castiga los dos errores simétricos —mandar una cabecera que la plantilla no declara, y omitirla en una que sí—. El respaldo por nombre solo entra cuando no se conoce la forma real: ahí la legada `adelanto_nomina` manda 2 variables y cualquier otra, 3.

Si `WHATSAPP_TEMPLATE_HEADER_IMAGE_URL` está definida **y** la plantilla declara cabecera de imagen, se añade el componente de cabecera. Sin forma conocida, el respaldo la añade a `adelanto_nomina_v2` y `adelanto_nomina_v3`.

El botón de URL sigue la misma regla: solo se manda si la plantilla lo declara. Una plantilla de **respuesta rápida** —la del chatbot Sí/No— no lo acepta, y mandárselo tumba el envío entero.

El idioma de cada mensaje es el **idioma real de la plantilla** que trae la sincronización con Meta; cuando no se conoce, cae al de `WHATSAPP_TEMPLATE_LANGUAGE` (por defecto `es_MX`). La versión de la Graph API es `v21.0` y vive en un único sitio, `src/lib/whatsapp/graph-version.ts`, sobreescribible con `WHATSAPP_GRAPH_VERSION`: estuvo clavada en `v18.0` en dos archivos hasta que esa versión quedó fuera de la ventana de soporte de Meta, y centralizarla fue justo para no volver a quedar atrapados.

### Categoría de plantilla y entrega (importante)

Meta **acepta** un envío (devuelve `message_status: accepted` y un `wamid`) pero puede **no entregarlo** sin dar error: una entrega filtrada no produce ninguna señal de fallo. Por eso conviene tener claro qué está comprobado y qué no.

**En esta cuenta, el envío masivo con plantilla MARKETING SÍ llega.** No es una suposición: la plantilla de ofertas en uso, `adelanto_nomina_oferta_v2`, está en categoría **MARKETING** y entregó **16 de 16** en los dos envíos reales —el 2026-09-07 y el 2026-09-23—, con la verificación del negocio todavía en `pending_submission`. En el del 23-sep, además, 11 de los 16 lo abrieron. Así que el miedo original —que Meta filtrara el marketing en silencio por no estar verificados— **no se materializó**, y el outreach masivo no está bloqueado por la verificación.

| Categoría | Plantillas | Entrega comprobada |
|---|---|---|
| **MARKETING** | `adelanto_nomina_oferta_v2` (la que se usa), `adelanto_nomina_oferta`, `adelanto_nomina_v3`, `adelanto_nomina_v2`, `adelanto_nomina` | Sí: 16/16 en dos envíos reales, sin verificación del negocio |
| **UTILITY** | `adelanto_contrato_listo` (el enlace de firma) | Sí. Es la categoría correcta para lo transaccional y la más fiable por diseño |

Lo que sigue siendo cierto, y por qué no hay que bajar la guardia:

1. **Entregar no es lo mismo que estar autorizado.** La entrega quedó comprobada con 16 personas de una empresa; no prueba que aguante a otra escala ni que Meta no cambie el criterio. Y hay un asunto aparte y más serio: la política de WhatsApp Business (§4) prohíbe los "anticipos de sueldo". Eso no se arregla verificando el negocio. → [Arquitectura](arquitectura.md)
2. **La verificación del negocio sigue pendiente** (`business_verification_status: pending_submission`). Ya no bloquea la entrega, pero es lo que permite que el número muestre un nombre en vez del número a secas.
3. **La ventana de 24 h de Meta** sigue siendo la vía más segura: si el empleado escribe primero, se puede responder con texto libre sin plantilla. Es por donde va todo el seguimiento del chatbot.

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

`Ofertas → Enviar` (`/ofertas`) tiene **4 pasos en UNA sola pantalla**: los tres primeros se recorren en la columna izquierda y el cuarto ("Paso 4 de 4", Enviar) queda fijo a la derecha, para que el botón y el motivo por el que todavía no se puede pulsar nunca se pierdan de vista.

1. **A quién le llega**: **Un ciclo completo** (empleados de un lote CSV aplicado) o **Personas sueltas** (búsqueda por nombre, RFC o teléfono).
2. **Qué mensaje reciben**: elegir la plantilla. Si un admin ya fijó la plantilla de ofertas en Ajustes, el paso solo ofrece esa; una plantilla sin aprobar exige marcar la casilla de riesgo.
3. **Revisar antes de mandar**: se valida elegibilidad y se muestra el conteo, con posibilidad de deseleccionar. Quitar a alguien cambia el envío a modo manual con la lista exacta que quedó marcada, porque en modo `import` el backend ignora `employeeIds` y le manda al lote entero.
4. **Enviar**: confirmar en el modal, que dice el número exacto de personas.

El resultado aparece arriba de los pasos y distingue cuatro desenlaces: salió, salió con fallos, se encoló, y **no salió nada nuevo porque ya se les había mandado hace minutos** (dedup). Tras un envío el botón queda bloqueado hasta pulsar «Preparar otro envío».

Solo aparecen como origen las importaciones en estado `aplicada`.

El operador no configura el botón ni el link. Si la plantilla tiene botón URL dinámico, el backend arma el enlace de **auto-servicio** `/solicitar/<token>` de cada empleado y manda a Meta su sufijo. **Al enviar no se genera ningún contrato** (decisión #2): el contrato —y la firma de EasyLex, que cuesta— se crea solo cuando la persona abre el enlace y confirma, o cuando contesta "Sí" al chatbot. Antes se generaba por CADA envío y se gastaba una firma incluso para quien nunca firmaba. Una plantilla de **respuesta rápida** (la del chatbot) no lleva botón de URL, y ahí no hay enlace que armar.

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

Hay un tercer modo que la UI no ofrece: `{"mode":"status","status":"pendiente_envio"}` manda a **todos los empleados de una etapa del embudo** (`backoffice_contract_control_v1.operational_status`) sin tener que enumerar ids. Hoy solo se admite `pendiente_envio`: reenviar la plantilla inicial a otra etapa sería incorrecto.

Ambos requieren cookie de sesión — no hay API key. `?action=validate` pide rol `solo_lectura`; enviar pide `operaciones`. Contrato completo en [API](api.md#whatsapp--envío).

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

**Dedup por empleado y plantilla en ventanas de 5 minutos** (`dedup_key` + índice único): volver a pulsar Enviar sobre la misma gente no le repite el mensaje, y esos empleados salen en `skipped`, no en `failed`. El modo cola tiene la misma garantía, pero ahí los repetidos se **pre-filtran** antes de crear las tareas y no viajan en `skipped`: la pantalla los deduce restando. Si la migración `20260724` no está aplicada la columna no existe y el envío **degrada a no tener idempotencia por empleado**, dejando el log `whatsapp.bulk_send.dedup_unavailable`.

Al terminar reconsulta la base y **sobrescribe los contadores en memoria** si no coinciden, dejando el log `whatsapp.bulk_send.count_mismatch`.

Al arrancar cualquier envío se barren los anteriores atascados en `sending` más de **30 minutos** (`reconcileStuckBulkSends`): sus mensajes sin completar pasan a `failed` y el envío se cierra recomputando contadores. Sin eso, un proceso muerto a mitad dejaba el envío en `sending` para siempre.

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

> **Pendiente:** con la cola activa la pantalla de resultado ya no miente —dice cuántos mensajes se **encolaron** y manda al detalle—, pero no se refresca sola: para ver cómo va cada uno hay que entrar al detalle del envío. Con el modo inline (por defecto) no aplica.

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
```

No hay binding de `roles/run.invoker` que dar: el worker corre en **Railway**, no en Cloud Run (ver [Infraestructura](infraestructura.md)). Lo que protege `/api/tasks/*` es la propia app, que valida el token OIDC con el que Cloud Tasks firma cada petición: firma, `audience` (el origen de `TASKS_WORKER_BASE_URL` más el path de la petición, nunca el `Host` entrante, que un atacante controla) y que el `email` del token sea exactamente `TASKS_INVOKER_SERVICE_ACCOUNT`. En producción, sin esa service account configurada el worker rechaza todo.

`--max-dispatches-per-second` es el límite real hacia Meta: ajústalo a la cuota de tu número. Después, definir las variables `GCP_PROJECT_ID`, `CLOUD_TASKS_QUEUE`, `TASKS_WORKER_BASE_URL` y `TASKS_INVOKER_SERVICE_ACCOUNT`. Ver [Configuración](configuracion.md).

Para volver al modo inline sin desmontar nada: `QUEUE_DRIVER=inline`.

## Historial y seguimiento

`Ofertas → Ver envíos anteriores` (`/ofertas/historial`) lista los envíos con filtros por estado (`pending`, `sending`, `completed`, `failed`), modo (`import`, `manual`, `status`) y rango de fechas; los filtros viven en la URL, así que un envío raro se puede compartir por chat. Al abrir un envío (`/ofertas/[envioId]`) se ve el detalle por destinatario, con búsqueda por RFC y filtro por cómo terminó cada mensaje.

### Estados de entrega

| Estado | Significado |
|---|---|
| `pending` | fila reclamada por el envío inline, todavía sin salir hacia Meta |
| (vacío / NULL) | mensaje **encolado**: el `delivery_status` queda en NULL hasta que el worker lo toma. La UI lo llama `queued` |
| `sent` | Meta aceptó el mensaje y está en cola de entrega |
| `delivered` | llegó al dispositivo |
| `read` | el destinatario lo abrió |
| `failed` | no se pudo entregar |

`delivered` y `read` se actualizan solos vía webhook. Si nunca pasan de `sent`, el webhook no está llegando.

> Filas migradas desde ManyChat pueden guardar estados en español (`enviado`, `entregado`, `click`) mientras el código nuevo escribe en inglés. Las vistas de backoffice aceptan ambos vocabularios; una consulta directa a la tabla debe contemplarlo.

## Auditoría de teléfonos

`Ajustes → Teléfonos` (`/ajustes/telefonos`) clasifica el teléfono de todos los empleados. Formato objetivo: **`521` + 10 dígitos = 13 dígitos**.

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
