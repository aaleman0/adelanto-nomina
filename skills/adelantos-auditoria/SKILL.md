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

Importación recibida, validada y aplicada · fila inválida o duplicada · empleado actualizado · oferta creada o reemplazada · solicitud de contrato recibida · elegibilidad aprobada o rechazada · oferta rechazada por la persona · documento creado en EasyLex · link enviado · contrato firmado · firma recibida sobre una solicitud que ya no está en curso · error de integración y reintento · corrección masiva de teléfonos.

## Correlación

Permite cruzar por: `batch_id`, `row_id`, `employee_id`, `offer_id`, `contract_request_id`, `contract_attempt_id`, `easylex_contract_id`, `wa_message_id`, `bulk_send_id`, `correlation_id`.

## Reglas

- Tratar la auditoría como producto operativo, no como logs técnicos.
- No exponer secretos ni datos sensibles completos en timelines.
- Registrar acciones de reintento con antes y después.
- Hacer idempotente todo webhook.

## Estado actual — dónde está flojo

Al auditar, empieza por aquí:

1. **El módulo compartido (`src/lib/audit/`) es la vía principal, pero no la única.** Delegan en `recordAuditEvent` / `recordIntegrationLog`: `request-contract.ts`, `mock-sign.ts`, `imports/apply.ts`, `deliver-signed-contract.ts`, `phone-audit/fix` y las acciones de backoffice **para `audit_events`**. Siguen escribiendo directo: el webhook de firma de EasyLex (`webhooks/easylex/sign/route.ts`, que inserta su `audit_events` con su propio guard de idempotencia, y su `integration_logs`), el webhook de WhatsApp (`whatsapp/webhooks.ts`) y el helper privado `createIntegrationLog` de `backoffice-actions.ts`. Importa porque la redacción de PII vive en el módulo (`redactPII`), no en la tabla: los dos webhooks la aplican a mano y hay que comprobar que lo sigan haciendo; el de backoffice no la necesita porque solo mete identificadores internos.
2. **La idempotencia de `easylex_events` tiene un hueco**: si falta `webhookId`, el `event_id` se sintetiza con `Date.now()` y nunca colisiona, así que un reintento de EasyLex duplica la fila de evidencia. La firma en sí no se reprocesa: de eso se encargan el guard `contract_attempts.status = 'firmado'` al entrar y la comprobación previa del `audit_events` de firma por `entity_id` + `event_name`. El hueco ensucia la evidencia, no el estado.
3. **La corrección masiva de teléfonos no es transaccional**: es un bucle de `update` por empleado y, si uno falla, los anteriores quedan aplicados. Registra un único `audit_events` con `entity_id: null` y el detalle en `metadata` (`fixed`, `errors`, `employee_ids`) — antes iba la cadena `"bulk"` en una columna `uuid`, el insert fallaba en silencio y la corrección se quedaba sin rastro. Lo que sigue faltando es el número ANTERIOR: se sabe a quién se le tocó el teléfono, no qué tenía antes.
4. **El actor ya se registra** en las acciones de backoffice: `recordAuditEvent` recibe el `Actor` de la sesión y guarda `actor_id`, más el correo y el rol en `metadata`. Al añadir una acción nueva, pásalo — si no, vuelve el problema de no saber quién hizo qué.
5. **`whatsapp_contract_messages.status` no tiene restricción** y convive en dos idiomas. Cualquier consulta de auditoría debe contemplar ambos vocabularios.
6. **El rechazo de la oferta no deja evidencia.** `handleNo` pone `advance_offers.status = 'rechazada'` y solo lo escribe en el log de la aplicación (`whatsapp.chatbot.no`), sin `audit_events`. El tablero ya distingue a quien dijo que no (`operational_status = 'rechazado'`), pero el timeline no: la vista no lee `advance_offers`, así que en el expediente de esa persona no aparece nada. Y es la decisión que más importa registrar: a los silenciosos se les reenvía la oferta, a quien dijo que no no se le molesta.

## Checklist de revisión

- ¿Cada flujo crítico genera eventos?
- ¿Cada webhook es realmente idempotente?
- ¿Los errores externos se pueden buscar por empleado?
- ¿El backoffice explica el estado actual sin consultar la base a mano?
- ¿Hay filtros para pendientes, fallidos y casos sin resolver?
