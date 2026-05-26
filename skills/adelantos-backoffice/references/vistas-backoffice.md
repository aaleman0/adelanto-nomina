# Backoffice - Vistas Y Columnas

El backoffice es solo para administracion interna. El empleado no inicia sesion ni visita esta pagina.

## Dashboard

- Empleados activos.
- Ofertas vigentes.
- Mensajes enviados por WhatsApp (ultimos 30 dias).
- Tasa de entrega y lectura.
- Solicitudes recibidas.
- Contratos generados.
- Contratos firmados.
- Contratos con error.
- Links expirados.
- Imports con errores.

## WhatsApp — Nuevo Envio (`/whatsapp/send`)

- Selector de modo: por importacion CSV o manual (IDs de empleados).
- Campo de nombre de plantilla (default: `adelanto_contrato`).
- Boton "Validar elegibilidad": muestra conteo de elegibles sin enviar.
- Boton "Enviar mensajes": confirma y envia el lote masivo.
- Toast con resultado: enviados, fallidos y errores.

## WhatsApp — Historial (`/whatsapp/history`)

Columnas: fecha, modo, estado, total, elegibles, enviados, fallidos, acciones.

Filtros: estado (`sending`, `completed`, `failed`), modo (`import`, `manual`), fecha desde/hasta.

Al hacer clic en un envio abre el detalle con estado por destinatario. Permite busqueda por RFC dentro del detalle.

## WhatsApp — Envio Masivo (`/whatsapp/bulk`)

Vista de formulario para iniciar envios masivos con validacion de elegibilidad previa.
Muestra progreso por estados: `validating`, `sending`, `done`.

## Importaciones

Columnas: batch, archivo, estado, filas totales, aplicadas, invalidas, duplicadas, usuario, fecha.

Acciones: ver detalle, descargar errores, revalidar, aplicar lote si esta pendiente.

## Control De Contratos

Columnas: empleado, RFC, telefono, empleador, monto, estado_mensaje, fecha_envio, fecha_click, estado_contrato, contract_id, link_vence, fecha_firma, ultimo_movimiento, error.

Acciones: ver timeline, copiar link, reintentar EasyLex, regenerar link expirado, abrir log.

Filtros: pendiente_envio, mensaje_enviado, solicitado, contrato_generado, link_expirado, firmado, error.

## Detalle De Empleado

Mostrar identidad minima, oferta vigente, ultimo mensaje WhatsApp enviado, solicitud de contrato, intento de firma y timeline. No mostrar CLABE ni datos bancarios en esta vista.

## Configuracion — WhatsApp (`/settings`)

Formulario para ingresar o actualizar credenciales de WhatsApp:
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- `WHATSAPP_APP_SECRET`
- `WHATSAPP_BUSINESS_NUMBER`

Muestra alerta si hay campos faltantes. Las env vars tienen precedencia sobre los valores guardados en BD.

## Timeline

Cada item debe mostrar fecha, origen, tipo de evento, resumen, resultado y usuario/proceso origen.
