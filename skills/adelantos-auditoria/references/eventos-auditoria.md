# Auditoria - Eventos Y Campos

## `audit_events`

- `id`
- `event_name`
- `entity_type`
- `entity_id`
- `employee_id`
- `correlation_id`
- `source`
- `previous_state`
- `new_state`
- `summary`
- `metadata`
- `actor_type`
- `actor_id`
- `created_at`

## Nombres De Eventos

- `import.received`
- `import.row_invalid`
- `import.applied`
- `employee.upserted`
- `offer.created`
- `manychat.request_received`
- `contract.eligibility_approved`
- `contract.eligibility_rejected`
- `easylex.create_requested`
- `easylex.create_succeeded`
- `easylex.create_failed`
- `easylex.webhook_received`
- `contract.signed`
- `payment.updated`
- `payment.cep_added`
- `manychat.help_requested`
- `manychat.help_answered`
- `integration.retry_scheduled`
- `integration.retry_failed`

## Correlacion

Usar uno o mas:

- `batch_id`
- `row_id`
- `employee_id`
- `offer_id`
- `request_id`
- `contract_id`
- `subscriber_id`
- `payment_id`
