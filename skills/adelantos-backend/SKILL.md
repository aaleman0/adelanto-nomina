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
- **Los webhooks responden `200` ante un fallo de NEGOCIO** —un mensaje que no se pudo atender, un estado que no se reconoce— para no provocar reintentos del proveedor; el fallo queda en `integration_logs`. Pero **no siempre 200**: firma ausente o inválida devuelve `401`, y un error inesperado (payload ilegible, base caída) devuelve `500` a propósito, porque ahí reintentar sí sirve. En el webhook de Meta el error de un mensaje se captura dentro del bucle, para no tumbar el resto del lote ni disparar un reintento de todo el evento.
- **Los mensajes de error van en español**, orientados al operador.
- **`export const runtime = "nodejs"`** en todo route handler.

## Realidades del código que sorprenden

- **La validación va con Zod en el borde.** Usa `parseJsonBody` / `parseQuery` de `src/lib/api/validation.ts` y define el esquema en `src/lib/whatsapp/schemas.ts`. Colócala **antes** del `try/catch`: un `400` de validación no debe salir del bloque que captura errores de servidor.
- **`request-contract` es la excepción**: conserva su parser propio porque acepta alias snake/camelCase y tiene 10 tests que fijan ese comportamiento. No lo migres sin actualizarlos.
- **Hay módulo de auditoría compartido**: `src/lib/audit/` (`recordAuditEvent` / `recordIntegrationLog`). Cuatro archivos siguen declarando un `createAuditEvent` privado —`request-contract.ts`, `backoffice-actions.ts`, `mock-sign.ts`, `imports/apply.ts`— pero **todos delegan** en el módulo: conservan la firma para no tocar a sus llamadores. No copies uno nuevo; llama al módulo.
- **El gate de auth es `src/proxy.ts`**, convención de Next.js 16. `src/middleware.ts` no existe.
- **Hay cola, pero está desactivada por defecto.** `getQueueDriver()` devuelve `inline` salvo que Cloud Tasks esté configurado. Si añades trabajo que pueda tardar, encólalo con el mismo patrón en vez de meterlo en el request.
- **Todo worker de cola debe ser idempotente.** Cloud Tasks entrega *al menos una vez*. El patrón usado es reclamar la fila con un `UPDATE ... WHERE status = 'queued'` antes de actuar; cópialo, no inventes otro.
- **Los códigos de respuesta de un worker son semánticos**: `200` completa la tarea, `4xx` la descarta, `5xx` la reintenta. Devolver `500` ante un rechazo permanente provoca reintentos infinitos.

## Reglas de negocio

- **Antes de dejar pedir, comprobar la VENTANA** (`ventanaDeLaPersona` + `pasoAlPedir`, en `src/lib/contracts/ventana-oferta.ts`): la abre solo un `bulk_contract_offer` que Meta aceptó y dura 24 h. Todo camino nuevo por el que alguien pueda pedir su adelanto tiene que pasar por ahí, y **falla en CERRADO**: negarle el adelanto a quien lo merecía se arregla reenviándole la oferta, un contrato vinculante que nadie ofreció ya no se deshace. La decisión es pura y probada; el acceso a base va aparte.
- Validar oferta vigente, elegible y cuenta bancaria activa antes de crear una solicitud.
- Una solicitud por oferta; una sola solicitud activa por empleado. Ambas garantizadas por constraints.
- Reutilizar el link vigente; regenerar como **nuevo intento** si expiró (TTL 24 h, `link-ttl.ts`). Es un plazo **distinto** del de la ventana, medido desde otro momento, aunque hoy los dos valgan 24: no derivar uno del otro — hay pruebas en los dos sentidos que lo impiden.
- **Una firma que llega sobre una solicitud que ya no está en curso se guarda como evidencia y NO revive la solicitud** (`queHacerConLaFirma`, `firma-tardia.ts`). El Excel de dispersión arma el pago con las solicitudes en `firmado`: revivir una reemplazada paga el monto anterior en un ciclo ya cerrado.
- Persistir estado antes de llamar a un servicio externo cuando sirva para reintentar.
- Devolver respuestas pequeñas y estables a quien consume desde WhatsApp.
- Guardar el `wamid` de cada mensaje para rastrear entrega.

Detalle en `docs/easylex-contratos.md`, `docs/whatsapp.md` y `docs/whatsapp-chatbot.md` (la ventana, las ramas del chatbot y qué oye la persona en cada caso).

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

Toda la auditoría pasa ya por el módulo compartido; no quedan helpers privados por migrar.

## Seguridad — pendientes reales

- **Rate limiting** ya está puesto en los handlers caros: los dos webhooks, el envío masivo, `request-contract`, la subida y aplicación de CSV, las acciones de backoffice y la sincronización de plantillas — y en los webhooks va **antes** de la verificación de firma, para que el martilleo no llegue ni a verificarse. Lo que sigue pendiente es su naturaleza: `enforceRateLimit` es **en memoria y por instancia**, así que frena abuso trivial pero no vale como límite global exacto (haría falta Redis). Un handler nuevo y caro lo añade igual: `enforceRateLimit(request, RATE_LIMITS.x)` al inicio y su límite en `rate-limit-config.ts`.
- **Fase B de RLS**: las políticas de SELECT por rol ya están escritas (`supabase/migrations/20260722_rls_policies_phase_b.sql`; aditivas, y sin políticas de escritura para `authenticated` a propósito, para que la anon key filtrada no pueda modificar nada). Lo que sigue pendiente es mover las lecturas al cliente de sesión: mientras todo se consulte con la service role key, esas políticas no entran en juego.
- Los secretos ya no se guardan en `settings`, pero **pueden quedar filas antiguas**: conviene borrarlas.

No registres datos sensibles completos en logs visibles.
