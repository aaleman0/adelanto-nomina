# Importacion CSV - Schema Inicial

## `import_batches`

- `id`
- `filename`
- `uploaded_by`
- `source_kind`: `excel`, `google_sheets`, `manual`
- `status`: `recibida`, `validando`, `aplicada`, `aplicada_con_errores`, `fallida`
- `total_rows`
- `valid_rows`
- `invalid_rows`
- `duplicate_rows`
- `created_at`
- `applied_at`

## `raw_import_rows`

- `id`
- `batch_id`
- `row_number`
- `raw_payload`
- `normalized_payload`
- `status`: `pendiente`, `valida`, `invalida`, `duplicada`, `aplicada`
- `errors`
- `warnings`
- `created_at`

## Validaciones Base

- `RFC` requerido; es el identificador principal del empleado.
- `Teléfono` requerido y normalizable.
- `Clabe` requerida para que la fila entre a tablas operativas.
- `Monto Prestamo Autorizado` numerico y mayor a cero cuando `Estatus Conversión = Aceptada`.
- `Estatus Conversión` requerido. En archivos reales puede traer valores de embudo como `Aceptada`, `Rechazada`, `Convertido`, `Pendiente`, `No convertido`, `Pendiente firma` o `No contactado`; no invalidar la fila solo por ese valor.
- RFC con formato razonable cuando venga informado.
- Empleador no vacio.
- Duplicado por RFC dentro del mismo lote.
- Telefono duplicado no autentica identidad; resolver por RFC y registrar advertencia si el mismo telefono aparece con RFC distinto.

## Normalizacion

- Telefono: remover espacios, parentesis, guiones y prefijos inconsistentes; guardar version E.164 cuando aplique.
- RFC: uppercase y trim.
- CURP: uppercase y trim.
- Email: lowercase y trim.
- Monto: decimal con dos posiciones.
- Estatus conversion: normalizar a minusculas sin acentos y conservar el valor para auditoria.

## Reimportacion

- Si una fila no aparece en una nueva importacion, no tocar registros existentes.
- Si el mismo RFC llega con telefono distinto, actualizar telefono desde el CSV mas reciente y registrar auditoria.
- Si el mismo RFC llega sin cambios relevantes, marcar fila como `sin_cambios` y no crear revision nueva.
- Si el mismo RFC llega con cambios relevantes, crear nueva version de oferta y conservar historial.
- Filas sin RFC, telefono o CLABE no pasan a tablas operativas; quedan como invalidas para backoffice.

## Columnas Del Archivo Fuente (requeridas)

- `Nombre`
- `Apellido Paterno`
- `Apellido Materno`
- `Monto Prestamo Autorizado`
- `Empleador`
- `Clabe`
- `Banco`
- `CURP`
- `RFC`
- `CP según CSF`
- `Teléfono`
- `Email`
- `Estado Civil`
- `Nacionalidad`
- `Lugar de Origen`
- `Fecha de Nacimiento`
- `Domicilio`
- `Estatus Conversión`

## Columnas Del Archivo Fuente (opcionales)

- `Estatus P/ esta Q` (se guarda como referencia/auditoria si viene)
- `Estatus de Cleinte` (se guarda como referencia/auditoria si viene)
