# Pagos Y CEP - Modelo Inicial

## `payments`

- `id`
- `employee_id`
- `contract_request_id`
- `amount`
- `currency`
- `status_pago`
- `clave_cep`
- `payment_reference`
- `fecha_dispersion`
- `source`
- `created_at`
- `updated_at`

## Eventos

- `payment.created`
- `payment.marked_processing`
- `payment.paid`
- `payment.cep_added`
- `payment.failed`
- `payment.corrected`
- `manychat.help_requested`
- `manychat.cep_returned`

## Mensajes Sugeridos

Pago pagado:

```text
Tu pago ya fue enviado. Tu clave de rastreo es: {{clave_cep}}.
Fecha de dispersion: {{fecha_dispersion}}.
```

Pago en proceso:

```text
Tu pago sigue en proceso. Te avisaremos por este mismo chat cuando tengamos la clave de rastreo.
```

No encontrado:

```text
No encontramos una solicitud activa asociada a este numero. Un asesor revisara tu caso.
```
