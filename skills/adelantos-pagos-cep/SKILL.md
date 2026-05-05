---
name: adelantos-pagos-cep
description: Gestionar pagos, dispersion y clave CEP dentro del sistema de adelantos, incluyendo carga masiva o actualizacion de pagos, status_pago, clave_cep, fecha_dispersion y respuestas de ManyChat para la palabra AYUDA. Use cuando Codex trabaje con estados de pago, carga de CEP, conciliacion, consulta por empleado o mensajes de pago pendiente, pagado o fallido.
---

# Adelantos Pagos CEP

## Proposito

Usar esta skill para manejar dispersion, pagos y CEP como datos operativos de la BD. ManyChat solo consulta y muestra el resultado.

## Responsabilidades

- Importar o actualizar pagos desde archivo, sistema financiero o carga manual.
- Guardar `status_pago`, `clave_cep`, `fecha_dispersion` y referencia interna.
- Responder consultas `AYUDA` desde el backend.
- Exponer pagos pendientes, fallidos o sin CEP en backoffice.
- Mantener historial de cambios de pago.

## Estados De Pago

- `pendiente`
- `en_proceso`
- `pagado`
- `fallido`
- `cancelado`

## Flujo AYUDA

1. ManyChat envia `subscriber_id`, telefono y/o RFC al backend.
2. Backend identifica empleado y solicitud relevante.
3. Backend busca pago mas reciente asociado al adelanto.
4. Si el pago esta pagado y tiene CEP, responder CEP y fecha.
5. Si no hay CEP, responder pago en proceso.
6. Si no hay empleado o solicitud, responder mensaje de soporte.

## Reglas

- No consultar portales manuales de CEP como dependencia principal del flujo masivo.
- Preferir que el sistema de dispersion entregue referencia, clave de rastreo o CEP para cargarlo a BD.
- Auditar cada cambio de estado de pago.
- No sobrescribir CEP existente sin registrar antes/despues y usuario/proceso origen.
- Permitir filtros de backoffice para `pagado_sin_cep`, `fallido` y `pendiente_mayor_a_x_horas`.

## Referencias

Leer `references/pagos-cep.md` para modelo inicial y mensajes sugeridos.
