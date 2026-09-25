---
name: adelantos-importacion-csv
description: Implementar o revisar importaciones masivas de empleados y ofertas de adelanto desde archivos CSV exportados de Excel o Google Sheets hacia Supabase. Use cuando haya que trabajar con validaciones, staging, raw import rows, batches, normalización de teléfonos/RFC/montos, detección de duplicados, reportes de errores o upserts operativos.
---

# Adelantos Importación CSV

## Lee primero

`docs/importacion-csv.md` — columnas exactas, normalización, validación, elegibilidad y reimportación.

Código: `src/lib/imports/csv.ts` (parseo) y `src/lib/imports/apply.ts` (aplicación).

## La regla central

**Nunca asumas que el CSV está limpio, y nunca escribas crudo en tablas operativas.**

Las dos etapas están separadas a propósito:

1. `POST /api/imports` → valida y deja staging. **No toca nada operativo.**
2. `POST /api/imports/[batchId]/apply` → aplica las filas válidas.

Esa separación permite revisar errores antes de comprometer datos. No la fusiones por conveniencia.

## Al modificar la importación, cuida

- **Mantener `batch_id` y `row_id` en todo dato derivado.** `employees`, `employee_bank_accounts` y `advance_offers` guardan `source_batch_id` y `source_row_id`; desde cualquier registro se llega a la línea exacta del archivo.
- **Conservar el valor original.** `raw_payload` guarda la fila tal como llegó; `normalized_payload` la versión limpia. La auditoría depende de esa pareja.
- **El lote se aplica solo si sale impecable.** Faltar una columna estructural lo deja `fallida`; cualquier fila inválida o duplicada lo deja `aplicada_con_errores` ya en la carga, y el apply lo rechaza porque solo acepta `validando`. Las filas malas se conservan en staging con su detalle: el camino es corregir el archivo y volver a cargarlo, no aplicar a medias.
- **Preferir upsert por RFC.** El teléfono no autentica identidad: si dos filas lo comparten, resuelve por RFC y registra advertencia.
- **Convertir montos a decimal**, nunca a texto.
- **No crear ruido al REAPLICAR el mismo lote.** Mismo `source_batch_id` y mismo hash → `sin_cambios`, sin oferta ni revisión nuevas (`isUnchangedReapply`). Un lote NUEVO es un ciclo nuevo: siempre nueva versión de oferta —aunque el monto no cambie—, la anterior a `reemplazada`, y el contrato del ciclo anterior cerrado con su enlace vencido en el acto.
- **No modificar lo firmado.** Una importación posterior no toca la solicitud en `firmado` ni su snapshot —son la evidencia y la base del pago—, pero sí reemplaza la oferta firmada: el ciclo nuevo necesita la suya.

## Dos trampas concretas

1. **`Estatus de Cleinte` está mal escrito en el archivo fuente**, y el código espera esa grafía. Corregir el encabezado rompe el reconocimiento de la columna.
2. **El estatus de conversión cambia de forma al aplicarse.** El CSV puede traer `Convertido`, que cuenta como elegible, pero `apply.ts` lo colapsa a `estatus_conversion = "aceptada"` porque la tabla tiene `CHECK (IN ('aceptada','rechazada'))`. El matiz del embudo solo sobrevive en `raw_payload`.

## Salidas esperadas

Tablas actualizadas, detalle de errores por fila guardado en `raw_import_rows` (`errors`/`warnings`; ninguna pantalla lo lista todavía: la carga solo muestra los conteos), resumen de cambios aplicados y eventos de auditoría tanto de la importación como de los upserts.
