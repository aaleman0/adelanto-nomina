# Modelo Supabase V1

## Decision Principal

Usar RFC como identidad principal del empleado. El telefono sirve para contacto y ManyChat, pero no debe decidir identidad cuando haya conflicto.

Stack v1 recomendado: Next.js + Supabase Postgres + Supabase Storage. Usar API routes/server-side para operaciones sensibles. Agregar worker/cola solo si EasyLex o ManyChat requieren procesamiento asincrono real.

Backoffice v1: interno y sin login por el momento; dejar preparado para Supabase Auth mas adelante.

EasyLex: detalles reales de API, webhook, polling, expiracion y regeneracion se confirman cuando empiece el trabajo directo con EasyLex/sandbox.

## Reimportacion

- Una importacion nueva actualiza datos existentes por RFC.
- Si una persona no viene en el CSV nuevo, no se toca.
- Si no hay cambios reales, no se crea nueva oferta ni revision.
- Si hay cambios operativos, crear nueva version de oferta y conservar la anterior.

## Oferta Recomendada

Modelo hibrido versionado:

- `employees` contiene identidad actual.
- `advance_offers` contiene versiones de oferta.
- Solo una oferta por empleado debe estar como `is_current = true`.
- Cada importacion puede reemplazar la oferta actual si detecta cambios.
- Cada contrato guarda snapshot de los datos usados al generarse.

Esto da registro historico sin crear ruido cuando se importa el mismo archivo dos veces.

## Tablas

### `employees`

- `id`
- `rfc`
- `curp`
- `nombre`
- `apellidos`
- `cp_csf`
- `telefono`
- `telefono_normalizado`
- `email`
- `empleador`
- `created_at`
- `updated_at`

### `employee_bank_accounts`

- `id`
- `employee_id`
- `clabe`
- `clabe_last4`
- `banco`
- `is_active`
- `created_at`
- `updated_at`

### `advance_offers`

- `id`
- `employee_id`
- `monto_prestamo_autorizado`
- `estatus_p_esta_q`
- `estatus_conversion`
- `estatus_cliente`
- `is_eligible`
- `is_current`
- `status`: `vigente`, `reemplazada`, `solicitada`, `firmada`, `rechazada`
- `source_batch_id`
- `source_row_id`
- `replaced_by_offer_id`
- `created_at`
- `updated_at`

### `contract_requests`

- `id`
- `employee_id`
- `offer_id`
- `status`: `recibida`, `generando`, `link_generado`, `firmado`, `error`
- `manychat_subscriber_id`
- `contract_snapshot`
- `requested_at`
- `signed_at`
- `created_at`
- `updated_at`

### `contract_attempts`

- `id`
- `contract_request_id`
- `attempt_number`
- `easylex_contract_id`
- `signing_url`
- `status`: `generando`, `generado`, `expirado`, `firmado`, `error`
- `expires_at`
- `generated_at`
- `signed_at`
- `error_message`
- `created_at`
- `updated_at`

## Constraints Recomendadas

- `employees.rfc` unico.
- `employees.curp` unico cuando exista.
- `contract_requests.offer_id` unico.
- `contract_attempts.easylex_contract_id` unico cuando exista.
- Indice unico parcial para una sola oferta actual por empleado: `employee_id where is_current = true`.
- Indice para busqueda por `telefono_normalizado`.

## Snapshot De Contrato

Guardar en `contract_requests.contract_snapshot`:

- nombre
- apellidos
- rfc
- curp
- clabe
- banco
- monto
- empleador
- telefono
- email
- source_batch_id
- source_row_id
