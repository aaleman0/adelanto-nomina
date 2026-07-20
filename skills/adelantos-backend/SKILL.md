---
name: adelantos-backend
description: Implementar o revisar el backend operativo del sistema de adelantos: endpoints para WhatsApp Cloud API, webhooks de EasyLex y Meta, reglas de negocio, estados, jobs, logs, reintentos, seguridad e idempotencia. Use cuando haya que crear o modificar API routes, servicios, máquinas de estado o integraciones entre WhatsApp, EasyLex, Supabase y el frontend interno.
---

# Adelantos Backend

## Lee primero

- `docs/api.md` — inventario completo de endpoints y sus contratos. **No inventes rutas: verifícalas ahí.**
- `docs/base-de-datos.md` — tablas, enums e índices que imponen las reglas.

## Convenciones que debes respetar

Son consistentes en todo el código; romperlas crea inconsistencia visible para quien consume la API.

- **El estado de negocio va en el body, no en el HTTP.** `request-contract` devuelve `200` incluso con `not_found`. El `400` se reserva a fallos de parseo.
- **Los webhooks siempre responden `200`**, incluso ante error capturado, para evitar reintentos del proveedor. El fallo se registra en `integration_logs`.
- **Los mensajes de error van en español**, orientados al operador.
- **`export const runtime = "nodejs"`** en todo route handler.

## Realidades del código que sorprenden

- **La validación va con Zod en el borde.** Usa `parseJsonBody` / `parseQuery` de `src/lib/api/validation.ts` y define el esquema en `src/lib/whatsapp/schemas.ts`. Colócala **antes** del `try/catch`: un `400` de validación no debe salir del bloque que captura errores de servidor.
- **`request-contract` es la excepción**: conserva su parser propio porque acepta alias snake/camelCase y tiene 11 tests que fijan ese comportamiento. No lo migres sin actualizarlos.
- **No hay módulo de auditoría.** Seis archivos declaran su propio `createAuditEvent` privado, y lo mismo ocurre con `createIntegrationLog`. Antes de copiar el helper una séptima vez, considera extraerlo.
- **El gate de auth es `src/proxy.ts`**, convención de Next.js 16. `src/middleware.ts` no existe.
- **Hay cola, pero está desactivada por defecto.** `getQueueDriver()` devuelve `inline` salvo que Cloud Tasks esté configurado. Si añades trabajo que pueda tardar, encólalo con el mismo patrón en vez de meterlo en el request.
- **Todo worker de cola debe ser idempotente.** Cloud Tasks entrega *al menos una vez*. El patrón usado es reclamar la fila con un `UPDATE ... WHERE status = 'queued'` antes de actuar; cópialo, no inventes otro.
- **Los códigos de respuesta de un worker son semánticos**: `200` completa la tarea, `4xx` la descarta, `5xx` la reintenta. Devolver `500` ante un rechazo permanente provoca reintentos infinitos.

## Reglas de negocio

- Validar oferta vigente, elegible y cuenta bancaria activa antes de crear una solicitud.
- Una solicitud por oferta; una sola solicitud activa por empleado. Ambas garantizadas por constraints.
- Reutilizar el link vigente; regenerar como **nuevo intento** si expiró (TTL 2 h).
- Persistir estado antes de llamar a un servicio externo cuando sirva para reintentar.
- Devolver respuestas pequeñas y estables a quien consume desde WhatsApp.
- Guardar el `wamid` de cada mensaje para rastrear entrega.

Detalle en `docs/easylex-contratos.md` y `docs/whatsapp.md`.

## Seguridad — lo que ya está resuelto

No lo deshagas por accidente:

- Los webhooks de Meta y EasyLex verifican su firma con `src/lib/security/webhook-signatures.ts`, **siempre en tiempo constante**. Si añades un webhook nuevo, usa ese módulo; no compares secretos con `===`.
- El webhook de Meta lee `await request.text()` y parsea después. **Cambiarlo a `request.json()` rompe la verificación HMAC**, porque la firma es sobre los bytes crudos.
- Ambos webhooks fallan *cerrados* en producción cuando falta el secreto.
- `mock-sign` responde `404` en producción.
- RLS está activada en deny-all; la app funciona porque `service_role` la bypassa.

## RBAC

Toda ruta de escritura empieza con `requireRole()`:

```ts
const auth = await requireRole("operaciones");
if (!auth.ok) return auth.response;
// auth.actor disponible para auditoría
```

Roles acumulativos: `solo_lectura` < `operaciones` < `admin`. El reparto por endpoint está en `docs/api.md`.

Dos cosas fáciles de olvidar:
- **Las server actions no pasan por `src/proxy.ts`**: comprueban el rol por su cuenta.
- Por defecto RBAC está en modo `warn` y **no bloquea**. No asumas que un rol insuficiente devuelve 403 salvo con `RBAC_ENFORCEMENT=enforce`.

## Auditoría

Usa `recordAuditEvent` / `recordIntegrationLog` de `src/lib/audit/`. **Pasa siempre `actor` cuando la acción venga del backoffice**, o se pierde quién la ejecutó.

`audit_events.entity_id` es de tipo **uuid**: pasar una cadena arbitraria hace fallar el insert.

Quedan 3 helpers duplicados por migrar (`request-contract.ts`, `mock-sign.ts`, `imports/apply.ts`).

## Seguridad — pendientes reales

- **Rate limiting** con `enforceRateLimit(request, RATE_LIMITS.x)` al inicio del handler (`src/lib/security/`). Límites en `rate-limit-config.ts`. Es en memoria y por instancia: frena abuso trivial, no vale como límite global exacto (haría falta Redis). Ponlo **antes** de la verificación de firma en webhooks, para que el martilleo no llegue ni a verificarse.
- **Fase B de RLS** pendiente: políticas por rol y lecturas con el cliente de sesión.
- Los secretos ya no se guardan en `settings`, pero **pueden quedar filas antiguas**: conviene borrarlas.

No registres datos sensibles completos en logs visibles.
