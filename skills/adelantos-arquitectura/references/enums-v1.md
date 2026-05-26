# Enums V1

## `import_status`

- `recibida`
- `validando`
- `aplicada`
- `aplicada_con_errores`
- `fallida`

## `row_status`

- `pendiente`
- `valida`
- `invalida`
- `duplicada`
- `sin_cambios`
- `aplicada`

## `offer_status`

- `vigente`
- `reemplazada`
- `solicitada`
- `firmada`
- `rechazada`

## `contract_request_status`

- `recibida`
- `generando`
- `link_generado`
- `firmado`
- `error`

## `contract_attempt_status`

- `generando`
- `generado`
- `expirado`
- `firmado`
- `error`

## `integration_status`

- `pending`
- `success`
- `failed`
- `retrying`

## `user_role`

Preparado para fase posterior:

- `admin`
- `operaciones`
- `solo_lectura`

## `whatsapp_message_status`

- `sent`
- `delivered`
- `read`
- `failed`

## `whatsapp_bulk_send_status`

- `sending`
- `completed`
- `failed`

## `integration_provider`

- `whatsapp`
- `easylex`
- `supabase`
- `backend`

## `audit_source`

- `csv`
- `whatsapp`
- `backend`
- `easylex`
- `backoffice`
- `system`
