---
name: adelantos-easylex
description: Integrar EasyLex en el flujo de adelantos para crear contratos, enviar links de firma, procesar webhooks de firma, guardar evidencia contractual y sincronizar estados con backend y ManyChat. Use cuando Codex trabaje con API EasyLex, contract_id, signing_url, estatus de contrato, callbacks, errores de firma, expiracion o evidencia de contrato firmado.
---

# Adelantos EasyLex

## Proposito

Usar esta skill para aislar todo lo relacionado con contrato, firma y evidencia contractual. Los detalles reales de EasyLex quedan pendientes hasta trabajar con EasyLex, sandbox o documentacion oficial del plan contratado.

## Responsabilidades

- Crear o preparar contrato con datos validados por el backend.
- Guardar `contract_id`, `signing_url`, estado y expiracion cuando aplique.
- Procesar webhooks de firma, rechazo, expiracion o error.
- Normalizar estados de EasyLex hacia estados internos.
- Conservar evidencia suficiente para soporte y auditoria.

## Flujo De Contrato

1. Recibir solicitud validada desde el backend.
2. Construir payload para EasyLex con datos minimos necesarios.
3. Llamar API de EasyLex.
4. Guardar respuesta cruda en log tecnico y resumen en tablas operativas.
5. Actualizar contrato a `generado` si existe link de firma.
6. Notificar o responder a ManyChat con `signing_url`.

## Webhook De Firma

Confirmar con EasyLex si el plan/API contratado soporta webhook o postback de firma cuando empiece el trabajo directo con EasyLex. Las paginas publicas mencionan API REST, documentacion API y sandbox, pero no muestran de forma publica el detalle del webhook.

1. Validar autenticidad del webhook si EasyLex ofrece firma o secreto.
2. Aplicar idempotencia por `event_id` o `contract_id + status + timestamp`.
3. Guardar payload crudo.
4. Traducir estado externo a estado interno.
5. Actualizar `contract_requests` y `contract_events`.
6. Crear evento de auditoria.
7. Actualizar ManyChat si el cambio debe comunicarse al empleado.

## Estados Internos

- `solicitado`
- `generando`
- `generado`
- `firmado`
- `expirado`
- `error`

## Reglas

- No llamar EasyLex si el empleado no esta activo o ya tiene una solicitud abierta equivalente.
- No confiar en campos enviados por ManyChat si la BD tiene datos normalizados.
- Guardar errores de EasyLex con codigo, mensaje, endpoint y correlacion.
- Mantener el link vivo por 2 horas desde su generacion.
- No invalidar links solo limpiando ManyChat; la expiracion real debe vivir en EasyLex o backend.
- Si no hay webhook de firma, implementar fallback por polling, conciliacion operativa o revision desde backoffice.

## Referencias

Leer `references/payloads-easylex.md` para payloads conceptuales y mapeo de estados.
Leer `../adelantos-arquitectura/references/fases-v1.md`; EasyLex mock corresponde a fase 5 y EasyLex real a fase 8.
