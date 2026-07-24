---
name: adelantos-auditoria
description: Auditar y fortalecer la trazabilidad del sistema de adelantos: evidencia de cambios, timelines, payloads, logs técnicos, eventos de negocio, reintentos y errores. Use cuando haya que revisar si el sistema permite explicar qué pasó con un empleado, contrato, importación o integración.
---

# Adelantos Auditoría

## Lee primero

`docs/base-de-datos.md` — estructura de `audit_events`, `integration_logs`, `easylex_events` y la vista de timeline.

## La pregunta que debe poder responderse

**Qué pasó, cuándo, de dónde vino, qué cambió y qué falta** — para cualquier empleado, contrato o importación, sin abrir Supabase a mano.

## Dos niveles, no los mezcles

| Tabla | Para qué | Audiencia |
|---|---|---|
| `integration_logs` | Depurar: payloads crudos, endpoint, código HTTP, correlación | Desarrollo |
| `audit_events` | Dar soporte: resumen legible, estado anterior y nuevo, origen, actor | Operación |

Un evento de negocio no pertenece a `integration_logs`, y un payload crudo no pertenece a un timeline que lee un operador.

## Evidencia mínima de un evento

Nombre estable · fecha y hora · entidad afectada · estado anterior y nuevo cuando aplique · origen (`csv`, `whatsapp`, `backend`, `easylex`, `backoffice`, `system`) · resumen legible · referencia al payload técnico si existe · resultado · actor.

## Flujos que deben generar evidencia

Importación recibida, validada y aplicada · fila inválida o duplicada · empleado actualizado · oferta creada o reemplazada · solicitud de contrato recibida · elegibilidad aprobada o rechazada · documento creado en EasyLex · link enviado · contrato firmado · error de integración y reintento · corrección masiva de teléfonos.

## Correlación

Permite cruzar por: `batch_id`, `row_id`, `employee_id`, `offer_id`, `contract_request_id`, `contract_attempt_id`, `easylex_contract_id`, `wa_message_id`, `bulk_send_id`, `correlation_id`.

## Reglas

- Tratar la auditoría como producto operativo, no como logs técnicos.
- No exponer secretos ni datos sensibles completos en timelines.
- Registrar acciones de reintento con antes y después.
- Hacer idempotente todo webhook.

## Estado actual — dónde está flojo

Al auditar, empieza por aquí:

1. **Todo pasa por el módulo compartido** (`src/lib/audit/`): `recordAuditEvent` y `recordIntegrationLog`. Ya no hay helpers privados ni inserts directos a `audit_events`/`integration_logs` repartidos por el código; los sitios que los tenían (`request-contract.ts`, `mock-sign.ts`, `imports/apply.ts`, backoffice) delegan en él.
2. **La idempotencia del webhook de EasyLex tiene un hueco**: si falta `webhookId`, el `event_id` se sintetiza con `Date.now()` y nunca colisiona, así que el evento se procesa siempre.
3. **La corrección masiva de teléfonos no es transaccional** y registra un único `audit_events` con `entity_id: "bulk"`, sin detalle por empleado. No se puede reconstruir qué número tenía cada uno.
4. **El actor ya se registra** en las acciones de backoffice: `recordAuditEvent` recibe el `Actor` de la sesión y guarda `actor_id`, más el correo y el rol en `metadata`. Al añadir una acción nueva, pásalo — si no, vuelve el problema de no saber quién hizo qué.
5. **`whatsapp_contract_messages.status` no tiene restricción** y convive en dos idiomas. Cualquier consulta de auditoría debe contemplar ambos vocabularios.

## Checklist de revisión

- ¿Cada flujo crítico genera eventos?
- ¿Cada webhook es realmente idempotente?
- ¿Los errores externos se pueden buscar por empleado?
- ¿El backoffice explica el estado actual sin consultar la base a mano?
- ¿Hay filtros para pendientes, fallidos y casos sin resolver?
