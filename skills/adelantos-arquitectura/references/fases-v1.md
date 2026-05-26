# Fases V1

## Principio

Construir por capas pequenas y verificables. No implementar todo el sistema de una sola vez. Cada fase debe dejar una pieza usable, revisable y facil de corregir antes de avanzar.

## Fase 0: Preparacion

Objetivo: crear base tecnica sin logica de negocio.

Alcance:

- Proyecto Next.js.
- Conexion a Supabase.
- Variables `.env`.
- Estructura de carpetas.
- Layout basico de backoffice interno.

Resultado esperado: app corriendo y Supabase conectado.

Estado: **completada**.

## Fase 1: Base De Datos

Objetivo: crear el schema Supabase.

Alcance:

- Enums.
- Tablas.
- Constraints.
- Indices.
- Storage buckets necesarios.

Resultado esperado: BD lista para imports, empleados, ofertas, contratos, logs y auditoria.

Archivo inicial: `supabase/migrations/0001_initial_schema.sql`.

Estado: **completada**. Migracion ejecutada exitosamente en Supabase.

## Fase 2: Importacion CSV

Objetivo: recibir CSV y validar datos sin afectar todavia tablas finales de forma opaca.

Alcance:

- Subida de CSV.
- Guardado de archivo original.
- `import_batches`.
- `raw_import_rows`.
- Validacion de columnas.
- Normalizacion.
- Errores y warnings por fila.

Resultado esperado: CSV visible en backoffice con filas validas, invalidas, duplicadas o sin cambios.

Estado: **completada**. Implementada con `POST /api/imports`; probada con CSV de 10 filas.

## Fase 3: Aplicacion De Datos

Objetivo: aplicar filas validas a tablas operativas.

Alcance:

- Upsert por RFC.
- Actualizar telefono si cambia.
- Actualizar datos bancarios.
- Crear o versionar oferta.
- Marcar elegibilidad por `Estatus Conversión = Aceptada`.
- Registrar auditoria.

Resultado esperado: empleados y ofertas quedan actualizados desde CSV.

Estado: **completada**. Implementada con `POST /api/imports/[batchId]/apply`; probada con batch de 10 filas, creando empleados, cuentas bancarias, ofertas, revisiones y eventos de auditoria.

## Fase 4: Backoffice De Lectura

Objetivo: permitir control visual basico.

Alcance:

- Importaciones.
- Empleados.
- Ofertas.
- Detalle de empleado.
- Timeline inicial.

Resultado esperado: equipo interno puede inspeccionar datos sin consultar Supabase manualmente.

Estado: **completada**.

## Fase 5: Contratos Mock

Objetivo: probar flujo de solicitud sin depender de EasyLex real.

Alcance:

- Endpoint de solicitud.
- Reglas de elegibilidad.
- Bloqueo de duplicados.
- `contract_requests`.
- `contract_attempts`.
- Link falso.
- Expiracion de 2 horas.

Resultado esperado: el sistema crea solicitudes y links mock respetando reglas.

Estado: **completada**.

## Fase 6: Backoffice De Contratos

Objetivo: controlar contratos desde la consola interna.

Alcance:

- Lista de contratos.
- Intentos de link.
- Estado y errores.
- Timeline.
- Regenerar link expirado.
- Reintentar flujo mock/EasyLex.

Resultado esperado: equipo interno puede auditar y operar contratos.

Estado: **completada**. Implementada con control de contratos, detalle operativo, timeline, regeneracion de link mock expirado y reintento mock desde backoffice. Probada con Playwright en flujo de acciones de backoffice.

## Fase 7: WhatsApp Cloud API

Objetivo: conectar el backend con WhatsApp Cloud API para envios masivos y recepcion de solicitudes.

Alcance:

- Envio masivo de mensajes de plantilla aprobada (`adelanto_contrato`) a empleados elegibles.
- Modos de envio: por importacion CSV o por lista manual de empleados.
- Validacion de elegibilidad previa al envio.
- Webhook de Meta para recibir estados de entrega: `sent`, `delivered`, `read`, `failed`.
- Historial paginado de envios masivos con detalle por destinatario.
- Health check de configuracion WhatsApp en `/api/health/whatsapp`.
- UI operativa: `/whatsapp` (dashboard), `/whatsapp/send` (envio), `/whatsapp/history` (historial), `/whatsapp/bulk` (envio masivo).
- Logs de errores y tasa de error en envios masivos.

Resultado esperado: equipo interno puede enviar mensajes masivos por WhatsApp y ver evidencia de entrega.

Estado: **completada**. Migrado de ManyChat a WhatsApp Cloud API directa. Probado con Playwright E2E y unit tests con Vitest. Health check y monitoreo de error rate implementados.

## Fase 8: EasyLex Real

Objetivo: reemplazar mock por EasyLex real.

Alcance:

- Confirmar endpoint, autenticacion y plan/API contratado con EasyLex (sandbox o produccion).
- Construir payload real para crear contrato.
- Llamar API real de EasyLex y guardar respuesta cruda en `integration_logs`.
- Guardar `easylex_contract_id` y `signing_url` real.
- Manejar errores reales: timeouts, contrato ya existente, empleado no valido, etc.
- Confirmar si el plan permite webhook de firma o se necesita polling/conciliacion manual.
- Actualizar `contract_attempts` con datos reales.
- Reemplazar mock en `POST /api/manychat/request-contract` (que ahora puede venir desde WhatsApp).

Resultado esperado: sistema genera links reales de firma EasyLex para enviar al empleado por WhatsApp.

## Fase 9: Confirmacion De Firma

Objetivo: actualizar contrato a firmado con evidencia real.

Alcance:

- Webhook EasyLex si el plan lo soporta (`POST /api/webhooks/easylex`).
- Polling si no existe webhook: job periodico que consulta estado del contrato.
- Fallback manual controlado si no hay confirmacion automatica: accion desde backoffice.
- Guardar eventos en `contract_events` con payload crudo y estado traducido.
- Actualizar `contract_requests` a `firmado` y `advance_offers` a `firmada`.
- Registrar auditoria de firma con evidencia.
- Notificar al empleado por WhatsApp cuando el contrato quede firmado.

Resultado esperado: contratos cambian a `firmado` con evidencia trazable y el empleado recibe confirmacion.

## Fase 10: Operacion Y Pulido

Objetivo: preparar v1 para operacion masiva controlada.

Alcance:

- Metricas consolidadas en dashboard: contratos por estado, tasa de firma, tiempos.
- Filtros avanzados por estado, empresa, rango de fecha y monto.
- Busqueda por RFC y telefono en todas las vistas.
- Export de errores y reporte operativo.
- Mejoras de logs y correlacion entre eventos.
- Protecciones basicas de acceso al backoffice (Supabase Auth + roles).
- Preparacion para pagos y CEP si el flujo de dispersion ya esta definido.

Resultado esperado: v1 operable, auditable y lista para iterar.

## Orden Obligatorio

Seguir las fases en orden salvo que el usuario indique lo contrario. No saltar a EasyLex real antes de que las fases 0 a 7 esten probadas.
