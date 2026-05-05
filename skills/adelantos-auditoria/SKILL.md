---
name: adelantos-auditoria
description: Auditar y fortalecer la trazabilidad del sistema masivo de adelantos, incluyendo evidencia de cambios, timelines, payloads resumidos, logs tecnicos, eventos de negocio, reintentos, errores, permisos y reportes operativos. Use cuando Codex deba revisar si el sistema permite explicar que paso con un empleado, contrato, pago, importacion o integracion.
---

# Adelantos Auditoria

## Proposito

Usar esta skill para asegurar que el sistema pueda responder una pregunta simple: que paso, cuando paso, de donde vino, que cambio y que falta.

## Evidencia Minima

- Evento de negocio con nombre estable.
- Fecha y hora.
- Entidad afectada.
- Estado anterior y nuevo cuando aplique.
- Origen: CSV, ManyChat, backend, EasyLex, pagos, usuario interno o job.
- Payload resumido.
- Referencia al payload tecnico completo si existe.
- Resultado: exito, pendiente, error o reintento.
- Usuario o proceso que lo ejecuto.

## Eventos Prioritarios

- Importacion recibida, validada y aplicada.
- Fila invalida o duplicada.
- Empleado actualizado.
- Solicitud recibida desde ManyChat.
- Elegibilidad validada.
- Contrato creado en EasyLex.
- Link enviado a ManyChat.
- Contrato firmado.
- Pago actualizado.
- CEP consultado por AYUDA.
- Error de integracion y reintento.

## Reglas

- Diseñar auditoria como producto operativo, no solo logs tecnicos.
- Mantener logs tecnicos para debug y eventos de auditoria para soporte.
- No exponer secretos ni datos sensibles completos en timelines.
- Hacer trazable cualquier cambio manual de pago o CEP.
- Permitir correlacion por empleado, telefono, subscriber_id, request_id, contract_id y batch_id.
- Registrar acciones de reintento con antes/despues.

## Checklist De Revision

- Confirmar que cada flujo critico genera eventos.
- Confirmar que cada webhook es idempotente.
- Confirmar que errores externos se pueden buscar por empleado.
- Confirmar que backoffice permite explicar el estado actual sin revisar la BD manualmente.
- Confirmar que hay filtros para pendientes, fallidos y casos sin CEP.

## Referencias

Leer `references/eventos-auditoria.md` para nombres de eventos y campos sugeridos.
