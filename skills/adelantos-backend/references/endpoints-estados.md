# Backend - Endpoints Y Estados

## Endpoints Implementados

### Contratos

#### `POST /api/manychat/request-contract`

Entrada: `subscriber_id`, `telefono_normalizado`, `rfc`, `first_name`, `last_name`.

Regla de elegibilidad: solo avanzar si el empleado tiene oferta vigente con `Estatus Conversión = Aceptada`.

Identidad: buscar empleado principalmente por RFC. Usar telefono normalizado como dato de contacto.

Solicitud: permitir solo una solicitud por oferta vigente. Si ya firmo, responder `already_signed`. Si el link expiro, regenerar como nuevo intento. Si no hay oferta, responder `no_offer`. Si no se encuentra el RFC, responder `not_found`.

Salida posible:

```json
{ "status": "contract_ready", "link_easylex": "https://...", "expires_at": "..." }
```

```json
{ "status": "already_signed", "message": "Tu contrato ya fue firmado." }
```

```json
{ "status": "not_found", "message": "RFC no encontrado." }
```

```json
{ "status": "not_eligible", "message": "Oferta no elegible." }
```

```json
{ "status": "no_offer", "message": "Sin oferta vigente." }
```

### Importaciones

#### `POST /api/imports`
Subida y validacion de CSV. Crea `import_batch` y `raw_import_rows`. Retorna resumen de filas validas, invalidas y duplicadas.

#### `POST /api/imports/[batchId]/apply`
Aplica filas validas de un lote a tablas operativas (`employees`, `advance_offers`, `employee_bank_accounts`). Registra auditoria.

### WhatsApp Cloud API

#### `POST /api/whatsapp/bulk`
Inicia un envio masivo. Con `?action=validate` solo valida elegibilidad sin enviar. Con `?action=send` (default) envia.

Entrada: `{ "mode": "import" | "manual", "importId"?: "uuid", "employeeIds"?: [], "templateName"?: "adelanto_contrato" }`

Salida: `{ "ok": true, "bulkSendId": "uuid", "total": N, "eligible": N, "sent": N, "failed": N, "status": "completed" }`

#### `GET /api/whatsapp/bulk/history`
Historial paginado. Parametros: `page`, `pageSize`, `status`, `mode`, `dateFrom`, `dateTo`.

#### `GET /api/whatsapp/bulk/detail`
Detalle de un envio masivo. Parametros: `id`, `page`, `q` (busqueda por RFC).

#### `GET/POST /api/whatsapp/config`
Obtener o guardar credenciales de WhatsApp en `settings` de Supabase.

#### `GET /api/whatsapp/stats`
Estadisticas: mensajes enviados, tasa de entrega, tasa de lectura, errores ultimas 24h.

#### `GET /api/whatsapp/templates`
Listar plantillas almacenadas en BD.

#### `POST /api/whatsapp/templates/sync`
Sincronizar plantillas desde Meta API.

### Webhooks

#### `GET /api/webhooks/whatsapp`
Verificacion del webhook por Meta (`hub.mode`, `hub.verify_token`, `hub.challenge`).

#### `POST /api/webhooks/whatsapp`
Recibe eventos de Meta: `sent`, `delivered`, `read`, `failed`. Actualiza estado en `whatsapp_messages`.

#### `POST /api/webhooks/easylex/mock-sign`
Simula firma de contrato para pruebas. Actualiza `contract_attempts` y `contract_requests`.

#### `POST /api/webhooks/easylex` _(pendiente — Fase 9)_
Webhook real de firma EasyLex. Validar autenticidad, aplicar idempotencia, actualizar contrato y notificar al empleado por WhatsApp.

### Health

#### `GET /api/health`
Estado general: Supabase + WhatsApp. Incluye `errorRate24h` y flag `alerting` si tasa de error supera 10%.

#### `GET /api/health/whatsapp`
Estado especifico de WhatsApp: credenciales configuradas, tasa de error reciente.

## Estados Operativos

- Solicitud: `recibida`, `validando`, `en_cola`, `procesando`, `completada`, `fallida`.
- Contrato: `solicitado`, `generando`, `generado`, `firmado`, `expirado`, `error`.
- Pago: `pendiente`, `en_proceso`, `pagado`, `fallido`, `cancelado`.
- WhatsApp mensaje: `sent`, `delivered`, `read`, `failed`.
- WhatsApp envio masivo: `sending`, `completed`, `failed`.

## Idempotencia

- Contrato: `employee_id + offer_id + action`
- EasyLex webhook: `event_id` si existe; si no, `contract_id + status + signed_at`
- Importacion: `batch_id + row_number`
- WhatsApp webhook: `wamid + status`
