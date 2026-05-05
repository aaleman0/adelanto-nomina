# Backoffice - Vistas Y Columnas

El backoffice es solo para administracion interna. El empleado no inicia sesion ni visita esta pagina.

## Dashboard

- Empleados activos.
- Ofertas vigentes.
- Mensajes enviados.
- Solicitudes recibidas.
- Contratos generados.
- Contratos firmados.
- Contratos con error.
- Links expirados.
- Imports con errores.

## Importaciones

Columnas: batch, archivo, estado, filas totales, aplicadas, invalidas, duplicadas, usuario, fecha.

Acciones: ver detalle, descargar errores, revalidar, aplicar lote si esta pendiente.

## Control De Contratos

Columnas: empleado, RFC, telefono, empleador, monto, estado_mensaje, fecha_envio, fecha_click, estado_contrato, contract_id, link_vence, fecha_firma, ultimo_movimiento, error.

Acciones: ver timeline, copiar link, reintentar EasyLex, regenerar link expirado, abrir log.

Filtros: pendiente_envio, mensaje_enviado, solicitado, contrato_generado, link_expirado, firmado, error.

## Detalle De Empleado

Mostrar identidad minima, oferta vigente, mensaje ManyChat, solicitud de contrato, intento de firma y timeline. No mostrar CLABE ni datos bancarios en esta vista.

## Timeline

Cada item debe mostrar fecha, origen, tipo de evento, resumen, resultado y usuario/proceso origen.
