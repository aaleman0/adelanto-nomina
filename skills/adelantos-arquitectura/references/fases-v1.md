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

Estado: migracion ejecutada exitosamente en Supabase el 2026-04-30.

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

Estado: implementada con `POST /api/imports`; probada con CSV de 10 filas.

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

Estado: implementada con `POST /api/imports/[batchId]/apply`; probada con batch de 10 filas, creando empleados, cuentas bancarias, ofertas, revisiones y eventos de auditoria.

## Fase 4: Backoffice De Lectura

Objetivo: permitir control visual basico.

Alcance:

- Importaciones.
- Empleados.
- Ofertas.
- Detalle de empleado.
- Timeline inicial.

Resultado esperado: equipo interno puede inspeccionar datos sin consultar Supabase manualmente.

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

Estado: implementada con control de contratos, detalle operativo, timeline, regeneracion de link mock expirado y reintento mock desde backoffice. Probada con Playwright en flujo de acciones de backoffice.

## Fase 7: ManyChat Real

Objetivo: conectar WhatsApp/ManyChat al backend.

Alcance:

- External Request `Solicítalo aquí`.
- Payload final.
- Respuestas por estado.
- Actualizacion de campos ManyChat cuando aplique.
- Logs de integracion.

Resultado esperado: empleado elegible puede solicitar desde WhatsApp.

## Fase 8: EasyLex Real

Objetivo: reemplazar mock por EasyLex real.

Alcance:

- Endpoint real para crear contrato.
- Payload real.
- Guardar `easylex_contract_id`.
- Guardar `signing_url`.
- Manejar errores reales.
- Confirmar expiracion real o logica interna de 2 horas.

Resultado esperado: sistema genera links reales de firma.

## Fase 9: Confirmacion De Firma

Objetivo: actualizar contrato a firmado.

Alcance:

- Webhook EasyLex si existe.
- Polling si no existe webhook.
- Fallback manual controlado si no hay confirmacion automatica.
- `easylex_events`.
- Auditoria de firma.

Resultado esperado: contratos cambian a `firmado` con evidencia.

## Fase 10: Operacion Y Pulido

Objetivo: preparar v1 para operacion masiva controlada.

Alcance:

- Metricas.
- Filtros.
- Busqueda por RFC y telefono.
- Export de errores.
- Mejoras de logs.
- Protecciones basicas.
- Preparacion para login/roles si se decide.

Resultado esperado: v1 operable, auditable y lista para iterar.

## Orden Obligatorio

Seguir las fases en orden salvo que el usuario indique lo contrario. No saltar a ManyChat o EasyLex real antes de que importacion, BD y contratos mock esten probados.
