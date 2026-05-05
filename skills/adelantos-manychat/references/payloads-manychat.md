# ManyChat - Payloads Iniciales

## Solicitud De Contrato

Endpoint backend: `POST /manychat/request-contract`

```json
{
  "subscriber_id": "{{subscriber.id}}",
  "first_name": "{{first_name}}",
  "last_name": "{{last_name}}",
  "phone": "{{phone}}",
  "telefono_normalizado": "{{telefono_normalizado}}",
  "empleador": "{{empleador}}",
  "monto_aprobado": "{{monto_aprobado}}",
  "rfc": "{{rfc}}"
}
```

## Respuesta Con Link

```json
{
  "status": "contract_ready",
  "message": "Tu contrato esta listo.",
  "link_easylex": "https://...",
  "estatus_contrato": "generado"
}
```

## Respuesta En Proceso

```json
{
  "status": "processing",
  "message": "Estamos generando tu contrato. Te avisaremos por este mismo chat.",
  "estatus_contrato": "generando"
}
```

## Consulta AYUDA

Endpoint backend: `POST /manychat/help`

```json
{
  "subscriber_id": "{{subscriber.id}}",
  "phone": "{{phone}}",
  "rfc": "{{rfc}}"
}
```

## Respuesta AYUDA Con CEP

```json
{
  "status": "paid",
  "status_pago": "pagado",
  "clave_cep": "1234567890",
  "fecha_dispersion": "2026-04-30"
}
```
