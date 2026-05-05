---
name: adelantos-manychat
description: Configurar, disenar o depurar flujos de ManyChat para solicitudes masivas de adelantos por WhatsApp, incluyendo broadcasts, custom fields, External Requests, palabra clave AYUDA, actualizacion de contactos y mensajes al empleado. Use cuando Codex trabaje con payloads ManyChat, subscriber_id, campos personalizados, segmentacion, respuestas conversacionales o sincronizacion con backend propio.
---

# Adelantos ManyChat

## Proposito

Usar esta skill para mantener ManyChat como unica capa conversacional del empleado. Evitar poner reglas de negocio complejas en ManyChat; delegarlas al backend. El empleado no debe visitar el backoffice.

## Responsabilidades De ManyChat

- Segmentar empleados con `Estatus Conversión = Aceptada` para broadcast.
- Enviar mensaje inicial con boton `Solicitalo aqui`.
- Ejecutar External Request al backend cuando el empleado solicita adelanto.
- Guardar campos custom utiles para respuesta y segmentacion.
- Activar flujo por palabra clave `AYUDA`.
- Mostrar mensajes de espera, exito, pendiente o error segun respuesta del backend.

## Campos Custom Recomendados

- `monto_aprobado`
- `monto_prestamo_autorizado`
- `estatus_empleado`
- `empleador`
- `rfc`
- `link_easylex`
- `estatus_contrato`
- `status_pago`
- `clave_cep`
- `fecha_dispersion`
- `telefono_normalizado`

Campos minimos confirmados para v1:

- `Empleador`
- `Monto Prestamo Autorizado`
- `link_easylex`
- `estatus_contrato`

## Flujo Solicitud

1. Enviar broadcast solo a segmento aceptado.
2. Capturar clic en `Solicitalo aqui`.
3. Mostrar confirmacion inmediata.
4. Mandar External Request a `POST /manychat/request-contract`.
5. Mapear respuesta a campos custom si el backend responde sincronicamente.
6. Mostrar link si ya esta disponible o mensaje de procesamiento si queda en cola.

## Flujo AYUDA

1. Detectar palabra clave `AYUDA`.
2. Mandar External Request a `POST /manychat/help`.
3. Mostrar CEP si `status_pago = pagado` y existe `clave_cep`.
4. Mostrar pago en proceso si no existe CEP.
5. Mostrar mensaje de soporte si el backend no encuentra al empleado.

## Reglas

- Siempre enviar `subscriber_id` al backend.
- Enviar telefono y campos conocidos, pero permitir que el backend use la BD como fuente de verdad.
- No guardar datos sensibles innecesarios en campos visibles de ManyChat.
- Disenar mensajes cortos, claros y sin prometer tiempos que dependan de EasyLex o pagos.
- Registrar errores de External Request en el backend cuando sea posible.

## Referencias

Leer `references/payloads-manychat.md` para payloads y respuestas sugeridas.
Leer `../adelantos-arquitectura/references/fases-v1.md`; ManyChat real corresponde a la fase 7.
