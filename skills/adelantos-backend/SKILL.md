---
name: adelantos-backend
description: Implementar o revisar el backend operativo del sistema de adelantos, incluyendo endpoints para WhatsApp Cloud API, webhooks de EasyLex, reglas de negocio, estados, colas, jobs, logs, reintentos, seguridad e idempotencia. Use cuando Codex deba crear APIs, modelos, servicios, workers, state machines o integraciones entre WhatsApp API, EasyLex, base de datos y front interno.
---

# Adelantos Backend

## Proposito

Usar esta skill para construir el cerebro del sistema con Next.js + Supabase como stack preferido para v1. El backend debe validar, decidir, persistir en Supabase Postgres, integrar y exponer evidencia mediante rutas server-side/API routes. Si EasyLex requiere procesos largos o limites estrictos, agregar worker/cola despues.

## Endpoints Implementados

- `POST /api/manychat/request-contract`: solicitud de contrato (compatible con WhatsApp y mock)
- `GET/POST /api/webhooks/whatsapp`: verificacion y recepcion de eventos Meta (entrega, lectura)
- `POST /api/webhooks/easylex/mock-sign`: webhook mock de firma EasyLex para pruebas
- `POST /api/imports`: subida y validacion de CSV
- `POST /api/imports/[batchId]/apply`: aplicar lote validado a tablas operativas
- `POST /api/whatsapp/bulk`: iniciar envio masivo (`?action=send` o `?action=validate`)
- `GET /api/whatsapp/bulk/history`: historial paginado de envios masivos
- `GET /api/whatsapp/bulk/detail`: detalle de un envio masivo
- `GET/POST /api/whatsapp/config`: obtener o guardar configuracion de WhatsApp
- `GET /api/whatsapp/stats`: estadisticas para dashboard
- `GET /api/whatsapp/templates`: listar plantillas
- `POST /api/whatsapp/templates/sync`: sincronizar plantillas desde Meta
- `GET /api/health/whatsapp`: health check de configuracion y conectividad WhatsApp
- `GET /api/health`: health check general (Supabase + WhatsApp)

## Endpoints Pendientes (Fase 8-9)

- `POST /api/webhooks/easylex`: webhook real de firma EasyLex

## Reglas De Negocio

- Validar empleado activo antes de crear solicitud.
- Verificar oferta vigente y monto aprobado.
- Evitar contratos duplicados para la misma oferta.
- Usar idempotency key para solicitudes de contrato.
- Manejar EasyLex de forma asincrona cuando haya volumen alto.
- Persistir estado antes de llamar servicios externos cuando sea util para reintentar.
- Devolver respuestas pequenas y estables al empleado por WhatsApp.
- Para envios masivos de WhatsApp: validar elegibilidad, enviar en lotes de 100 con pausa de 1s entre lotes.
- Guardar `wamid` de cada mensaje enviado para rastreo de entrega.
- Monitorear tasa de error en envios masivos; alertar si supera el 10%.

## Colas Y Workers

- Crear job para generar contrato si la llamada puede tardar.
- Crear job para actualizar estado en WhatsApp despues de EasyLex.
- Crear job para procesar importaciones grandes.
- Registrar reintentos con limite y razon.
- Mover fallas permanentes a estado visible en backoffice.

## Seguridad

- Validar `WHATSAPP_APP_SECRET` en webhooks de Meta usando firma HMAC.
- Validar tokens o secretos de EasyLex en su webhook.
- Separar credenciales por ambiente.
- No registrar datos sensibles completos en logs visibles.
- En v1 el backoffice puede operar sin login; dejar estructura preparada para proteger endpoints con Supabase Auth y roles despues.

## Referencias

Leer `references/endpoints-estados.md` para contratos API iniciales y estados operativos.
Leer `../adelantos-arquitectura/references/fases-v1.md` antes de implementar endpoints para respetar el orden por fases.
