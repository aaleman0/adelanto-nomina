---
name: adelantos-backend
description: Implementar o revisar el backend operativo del sistema de adelantos, incluyendo endpoints para ManyChat, webhooks de EasyLex, reglas de negocio, estados, colas, jobs, logs, reintentos, seguridad e idempotencia. Use cuando Codex deba crear APIs, modelos, servicios, workers, state machines o integraciones entre ManyChat, EasyLex, base de datos y front interno.
---

# Adelantos Backend

## Proposito

Usar esta skill para construir el cerebro del sistema con Next.js + Supabase como stack preferido para v1. El backend debe validar, decidir, persistir en Supabase Postgres, integrar y exponer evidencia mediante rutas server-side/API routes. Si EasyLex requiere procesos largos o limites estrictos, agregar worker/cola despues.

## Endpoints Minimos

- `POST /manychat/request-contract`
- `POST /manychat/help`
- `POST /webhooks/easylex`
- `POST /imports/csv`
- `GET /imports/:id`
- `GET /employees`
- `GET /employees/:id`
- `GET /contracts`
- `GET /payments`
- `GET /audit-events`

## Reglas De Negocio

- Validar empleado activo antes de crear solicitud.
- Verificar oferta vigente y monto aprobado.
- Evitar contratos duplicados para la misma oferta.
- Usar idempotency key para clics de ManyChat.
- Manejar EasyLex de forma asincrona cuando haya volumen alto.
- Persistir estado antes de llamar servicios externos cuando sea util para reintentar.
- Devolver respuestas pequenas y estables para ManyChat.

## Colas Y Workers

- Crear job para generar contrato si la llamada puede tardar.
- Crear job para actualizar ManyChat despues de EasyLex.
- Crear job para procesar importaciones grandes.
- Registrar reintentos con limite y razon.
- Mover fallas permanentes a estado visible en backoffice.

## Seguridad

- Validar tokens o secretos de ManyChat y EasyLex.
- Separar credenciales por ambiente.
- No registrar datos sensibles completos en logs visibles.
- En v1 el backoffice puede operar sin login; dejar estructura preparada para proteger endpoints con Supabase Auth y roles despues.

## Referencias

Leer `references/endpoints-estados.md` para contratos API iniciales y estados operativos.
Leer `../adelantos-arquitectura/references/fases-v1.md` antes de implementar endpoints para respetar el orden por fases.
