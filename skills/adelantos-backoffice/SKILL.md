---
name: adelantos-backoffice
description: Diseñar o implementar el front interno del sistema de adelantos para visualizar evidencia operativa, importaciones, empleados, contratos, errores, logs y timelines por empleado. Use cuando se construyan dashboards, tablas, filtros, detalle de empleado, vistas de auditoría o pantallas administrativas para operación masiva.
---

# Adelantos Backoffice

## Lee primero

- `docs/frontend.md` — rutas existentes, componentes y sistema de diseño.
- `docs/base-de-datos.md` — las vistas `backoffice_contract_control_v1` y `backoffice_contract_timeline_v1` alimentan casi todo.

## Qué es esta aplicación

Una consola administrativa interna. **El empleado nunca la ve ni inicia sesión en ella**; solo recibe mensajes de WhatsApp y firma en EasyLex.

Su función es controlar evidencia del flujo: a quién se le envió mensaje, quién solicitó, a quién se le generó link, cuál sigue vigente, quién firmó, cuándo ocurrió cada movimiento y qué errores existen.

No administra pagos ni datos financieros: no existe código de pagos ni CEP en el proyecto.

## Reglas de UX operativa

- Diseñar como consola interna, no como portal de usuario final.
- No crear páginas públicas para empleados. La única excepción es `/firmar/[signerId]`, que solo redirige.
- Tablas con filtros y paginación **server-side**. No cargar miles de filas en el cliente.
- Hacer buscables teléfono, RFC y nombre.
- Estados con etiquetas consistentes.
- **No mostrar CLABE ni datos bancarios.** La vista de control los excluye deliberadamente; no los reintroduzcas por conveniencia.
- Payloads completos solo bajo expansión o vista técnica.
- Acciones con confirmación cuando regeneren links o reintenten integraciones.

## Estados operativos

`operational_status` es un `CASE` en la vista donde **gana la primera coincidencia**. La lista y su orden exacto están en `docs/base-de-datos.md`.

El orden importa: al añadir un filtro o badge, respétalo. Está replicado a mano en `ContractOperationalStatus` (`src/lib/backoffice/contract-control.ts`), así que un cambio en la vista obliga a actualizar el tipo — nada lo verifica automáticamente.

## Antes de escribir UI

Revisa `docs/frontend.md` para no duplicar lo que ya existe. En particular ya hay: `DataTable`, `StatusBadge`, `Metric`, `EmptyState`, `PaginationControls`, `ConfirmDialog`, `CopyLinkButton` y `Toast`.

Hay inconsistencias conocidas —`useDebounce` implementado tres veces, dos sistemas de badges conviviendo— listadas al final de `docs/frontend.md`. No las repliques.

## Roles

`profiles.role` se aplica en el backend con `requireRole()` y en la UI: `solo_lectura` < `operaciones` < `admin`.

**Cómo gatear en la UI:**
- El shell siembra el rol en un contexto de cliente (`RoleProvider`). Los componentes de cliente lo leen con `useHasRole("operaciones")` de `@/components/auth/role-context`.
- Para deshabilitar un control: `disabled={!canX}` + `title` con el motivo, o envolver en `<RoleGate minimum="..." mode="disable">`.
- Para ocultar navegación: añade `minimumRole` a la entrada en `app-shell.tsx`; se filtra en el servidor.
- **Toda ruta admin-only necesita además un guard de servidor** (`layout.tsx` con `getCurrentActor` + `redirect`). Ocultar el enlace no protege la URL directa. Ver `src/app/settings/layout.tsx`.

**Importante:** las piezas puras de rol (`UserRole`, `hasRole`) están en `@/lib/auth/roles-shared` (sin imports de servidor). Los componentes de cliente importan de ahí, nunca de `@/lib/auth/roles`, que arrastra `next/headers` al bundle.

Esto es UX: refleja el rol siempre, con independencia de `RBAC_ENFORCEMENT`. La barrera real es el backend.
