# Importación CSV

Convierte archivos exportados de Excel o Google Sheets en datos operativos. Código: `src/lib/imports/csv.ts` (parseo y validación) y `src/lib/imports/apply.ts` (aplicación).

El principio que gobierna todo: **nunca asumir que el CSV está limpio, y nunca escribir crudo en tablas operativas**.

## Dos etapas separadas

La separación es deliberada: permite revisar los errores antes de tocar nada operativo.

```
POST /api/imports                    →  valida y deja staging
                                        import_batches + raw_import_rows
                                        NO modifica employees ni advance_offers

POST /api/imports/[batchId]/apply    →  aplica las filas válidas
                                        upsert en employees, employee_bank_accounts, advance_offers
                                        registra advance_offer_revisions y audit_events
```

Subir el archivo no cambia nada operativo. En la pantalla `/imports`, el botón **Aplicar** solo aparece para lotes en estado `validando` con `valid_rows > 0`.

## Columnas requeridas

18 columnas, con estos nombres exactos (`REQUIRED_COLUMNS`):

`Nombre` · `Apellido Paterno` · `Apellido Materno` · `Monto Prestamo Autorizado` · `Empleador` · `Clabe` · `Banco` · `CURP` · `RFC` · `CP según CSF` · `Teléfono` · `Email` · `Estado Civil` · `Nacionalidad` · `Lugar de Origen` · `Fecha de Nacimiento` · `Domicilio` · `Estatus Conversión`

Si falta alguna, el lote entero se marca `fallida` y **no se inserta ninguna fila** en staging. La respuesta trae `missingColumns` con la lista.

Existe un mapa `HEADER_ALIASES` que tolera variantes de acentuación y erratas comunes en los encabezados, así que no es necesario que el archivo coincida carácter por carácter.

## Columnas opcionales

- `Estatus P/ esta Q`
- `Estatus de Cleinte`

> El nombre `Estatus de Cleinte` está mal escrito **en el archivo fuente original**, y el código espera esa grafía. No es un error tipográfico de esta documentación: si se corrige el encabezado en el CSV, la columna deja de reconocerse.

Ambas se guardan como referencia y auditoría; no participan en ninguna decisión.

## Normalización

| Campo | Tratamiento |
|---|---|
| Teléfono | se quitan espacios, paréntesis, guiones y prefijos inconsistentes; se guarda solo dígitos en `telefono_normalizado`, conservando el original en `telefono` |
| RFC | `trim` + mayúsculas |
| CURP | `trim` + mayúsculas |
| Email | `trim` + minúsculas |
| Monto | decimal con dos posiciones |
| Estatus Conversión | minúsculas y sin acentos (`normalize("NFD")` + eliminación de diacríticos) |
| Fecha de nacimiento | se convierte a `date`, `null` si no es parseable |

El valor original siempre se conserva en `raw_payload`; la versión limpia va en `normalized_payload`.

## Validación por fila

Cada fila queda en uno de tres estados (`row_status`): `valida`, `invalida` o `duplicada`.

Reglas:

- **RFC** requerido — es la identidad del empleado.
- **Teléfono** requerido y normalizable a 10–15 dígitos.
- **CLABE** requerida, exactamente 18 dígitos, para que la fila llegue a tablas operativas.
- **Monto** numérico y mayor a cero cuando la fila es elegible.
- **Estatus Conversión** requerido.
- **Empleador** no vacío.
- **Duplicado por RFC** dentro del mismo lote → `duplicada`.

Un error aislado no bloquea el lote: solo faltar columnas estructurales lo hace. Las filas inválidas quedan en staging con su detalle en `errors` y `warnings`, visibles desde el backoffice para corregir y reimportar.

Si el mismo teléfono aparece con RFC distinto se registra una **advertencia**, no un error: el teléfono no determina identidad.

## Elegibilidad

`ELIGIBLE_CONVERSION_STATUSES` acepta dos valores tras normalizar: **`aceptada`** y **`convertido`**.

El recorrido completo del valor merece atención porque cambia de forma:

1. El CSV puede traer cualquier valor de embudo: `Aceptada`, `Rechazada`, `Convertido`, `Pendiente`, `No convertido`, `Pendiente firma`, `No contactado`…
2. `normalizeStatus()` lo pasa a minúsculas y le quita acentos, **conservando el valor tal cual** si no es `aceptada` ni `rechazada`.
3. `is_eligible` en staging se calcula como "¿está en {`aceptada`, `convertido`}?".
4. Al aplicar el lote, `apply.ts` **colapsa el valor** a `estatus_conversion = isEligible ? "aceptada" : "rechazada"` y `status = isEligible ? "vigente" : "rechazada"`.

Es decir: un `Convertido` en el CSV se guarda en la base como `aceptada`. Esa reducción es necesaria porque `advance_offers` tiene `CHECK (estatus_conversion IN ('aceptada','rechazada'))` y la columna generada `is_eligible` se define como `estatus_conversion = 'aceptada'`. El matiz del embudo se pierde en tablas operativas pero **queda íntegro en `raw_import_rows.raw_payload`** para auditoría.

Ningún valor de estatus invalida una fila por sí solo — solo determina elegibilidad.

## Reimportación

El comportamiento ante un archivo repetido:

| Situación | Resultado |
|---|---|
| El RFC no aparece en el CSV nuevo | No se toca nada de ese empleado |
| El RFC llega sin cambios relevantes | Fila `sin_cambios`; no se crea oferta ni revisión |
| El RFC llega con cambios operativos | Nueva versión de oferta; la anterior pasa a `reemplazada` con `replaced_by_offer_id`; se registra en `advance_offer_revisions` |
| El RFC llega con teléfono distinto | Se actualiza el teléfono y se registra auditoría |
| La fila no tiene RFC, teléfono o CLABE | Queda `invalida`, no llega a tablas operativas |
| La oferta ya está firmada | No se modifica lo firmado, aunque el CSV traiga otros datos |

La detección de cambios usa `row_hash` en staging y `source_hash` en la oferta. Por eso reimportar el mismo archivo dos veces no genera ruido.

## Resultado de aplicar

```json
{ "batchId": "uuid", "status": "aplicada",
  "appliedRows": 118, "changedRows": 12, "unchangedRows": 106,
  "createdEmployees": 4, "updatedEmployees": 8,
  "createdOffers": 12, "replacedOffers": 8 }
```

El estado del lote (`import_status`) puede quedar en `aplicada` o `aplicada_con_errores`.

## Almacenamiento del archivo

El CSV original se guarda en el bucket privado `imports` bajo `{uuid}/{safeFilename}`, con `upsert: false`. Límite 50 MB. El bucket `import-reports` (10 MB) está creado para reportes de error pero todavía no se escribe desde el código.

## Trazabilidad

Toda fila derivada del CSV conserva su procedencia: `employees`, `employee_bank_accounts` y `advance_offers` guardan `source_batch_id` y `source_row_id`. Desde cualquier registro operativo se puede llegar a la línea exacta del archivo que lo originó.

Ver también: [Base de datos](base-de-datos.md) · [API](api.md#importaciones)
