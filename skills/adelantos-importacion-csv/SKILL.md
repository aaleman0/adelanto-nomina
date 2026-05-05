---
name: adelantos-importacion-csv
description: Implementar o revisar importaciones masivas de empleados, ofertas de adelanto, pagos o CEP desde archivos CSV exportados de Excel o Google Sheets hacia una base de datos normalizada. Use cuando Codex deba crear validaciones, staging tables, raw import rows, batch IDs, normalizacion de telefonos/RFC/montos, deteccion de duplicados, reportes de errores o upserts operativos.
---

# Adelantos Importacion CSV

## Proposito

Usar esta skill para convertir archivos CSV de Excel o Google Sheets en datos confiables dentro de Supabase Postgres. Nunca asumir que el CSV ya esta limpio.

## Flujo Recomendado

1. Crear un `import_batch` por archivo recibido.
2. Guardar el archivo original en Supabase Storage cuando aplique.
3. Guardar cada fila en `raw_import_rows` con numero de fila y payload original.
4. Validar columnas requeridas antes de aplicar cambios operativos.
5. Normalizar telefono, RFC, monto, email, empleador y estatus.
6. Detectar duplicados dentro del archivo y contra la base de datos.
7. Clasificar filas como validas, advertidas o invalidas.
8. Aplicar upserts a tablas finales en una etapa separada.
9. Registrar resumen del lote: filas totales, aplicadas, omitidas, invalidas y duplicadas.
10. Exponer errores por fila al backoffice para correccion.

## Reglas

- No insertar filas crudas directamente en tablas operativas.
- No bloquear todo el lote por errores aislados salvo que falten columnas estructurales.
- Mantener `batch_id` en todo dato derivado del CSV.
- Preferir upsert por identificador estable: RFC si es confiable; telefono normalizado si no lo es.
- Convertir montos a decimal de BD, no a texto.
- Guardar valores originales cuando haya normalizacion sensible.

## Columnas Minimas

- `Nombre`
- `Apellidos`
- `Monto Prestamo Autorizado`
- `Empleador`
- `Clabe`
- `Banco`
- `CURP`
- `RFC`
- `CP según CSF`
- `Teléfono`
- `Email`
- `Estatus P/ esta Q`
- `Estatus Conversión`
- `Estatus de Cleinte`

## Elegibilidad Inicial

- Usar `Estatus Conversión = Aceptada` como regla principal para permitir solicitud de adelanto.
- Usar `Estatus Conversión = Rechazada` como bloqueo operativo para broadcast y contrato.
- Mantener los valores originales de estatus en staging para auditoria y mapearlos a estados internos normalizados.

## Salidas Esperadas

- Tablas actualizadas.
- Reporte de errores por fila.
- Resumen de cambios aplicados.
- Eventos de auditoria para importacion y upserts.

## Referencias

Leer `references/schema-importacion.md` cuando se necesiten nombres de tablas, estados y validaciones.
Leer `../adelantos-arquitectura/references/fases-v1.md`; importacion CSV corresponde principalmente a las fases 2 y 3.
