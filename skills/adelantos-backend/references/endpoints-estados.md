# Backend - Endpoints Y Estados

## `POST /manychat/request-contract`

Entrada: subscriber_id, telefono, rfc y campos conocidos por ManyChat.

Regla de elegibilidad inicial: solo avanzar si el empleado/oferta viene de una fila con `Estatus Conversión = Aceptada`.

Identidad: autenticar y buscar empleado principalmente por RFC. Usar telefono normalizado para vincular ManyChat y como dato de contacto.

Solicitud: permitir solo una solicitud por oferta vigente y no permitir mas de una solicitud activa por empleado. Si ya firmo, responder que el contrato ya fue firmado. Si el link expiro, regenerar link como nuevo intento dentro de la misma solicitud.

Salida:

```json
{
  "status": "processing",
  "request_id": "req_123",
  "estatus_contrato": "generando"
}
```

o:

```json
{
  "status": "contract_ready",
  "request_id": "req_123",
  "link_easylex": "https://...",
  "estatus_contrato": "generado"
}
```

## `POST /manychat/help`

Responder desde BD. No depender del CSV original ni de ManyChat como fuente de verdad.

## `POST /webhooks/easylex`

Validar autenticidad, aplicar idempotencia, guardar evento, actualizar contrato y disparar sincronizacion ManyChat.

Pendiente de confirmacion con EasyLex: disponibilidad de webhook/postback de firma en el plan/API contratado. Si no existe, usar endpoint o job de conciliacion.

## Estados Operativos

- Solicitud: `recibida`, `validando`, `en_cola`, `procesando`, `completada`, `fallida`.
- Contrato: `solicitado`, `generando`, `generado`, `firmado`, `expirado`, `error`.
- Pago: `pendiente`, `en_proceso`, `pagado`, `fallido`, `cancelado`.
- Job: `queued`, `running`, `succeeded`, `failed`, `dead`.

## Idempotencia

Usar claves como:

- ManyChat: `subscriber_id + offer_id + action`
- EasyLex: `event_id` si existe; si no, `contract_id + status + signed_at`
- Importacion: `batch_id + row_number`
