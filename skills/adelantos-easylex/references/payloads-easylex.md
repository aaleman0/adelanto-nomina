# EasyLex - Payloads Conceptuales

## Crear Contrato

Confirmar endpoint real con EasyLex antes de produccion.

```json
{
  "external_id": "contract_request_id",
  "employee": {
    "name": "Nombre Apellidos",
    "phone": "528100000000",
    "email": "persona@example.com",
    "rfc": "AAAA000000AAA"
  },
  "employer": {
    "name": "Empresa"
  },
  "advance": {
    "amount": "4500.00",
    "currency": "MXN"
  },
  "callback_url": "https://api.example.com/webhooks/easylex"
}
```

## Respuesta Esperada

```json
{
  "contract_id": "abc123",
  "signing_url": "https://firma.easylex.com/abc123",
  "status": "created"
}
```

## Webhook Conceptual

```json
{
  "event_id": "evt_123",
  "contract_id": "abc123",
  "external_id": "contract_request_id",
  "status": "signed",
  "signed_at": "2026-04-30T12:00:00Z"
}
```

## Mapeo Inicial

- `created` -> `generado`
- `sent` -> `generado`
- `signed` -> `firmado`
- `expired` -> `expirado`
- `failed` -> `error`
