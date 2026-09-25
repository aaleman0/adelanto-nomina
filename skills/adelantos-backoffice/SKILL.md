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

No mueve dinero: no hay código de pagos ni CEP en el proyecto. Pero sí maneja las cifras del adelanto —el monto autorizado se muestra en pantalla— y es la consola que **entrega el Excel de dispersión**: `/nomina/[loteId]` descarga, para los empleados que firmaron en ese ciclo, nombre, RFC, monto autorizado y total a pagar. El pago se hace fuera; la lista con la que se paga sale de aquí.

## Reglas de UX operativa

- Diseñar como consola interna, no como portal de usuario final.
- No crear páginas públicas para empleados. Ya hay dos y son las únicas: `/solicitar/[token]`, el auto-servicio que el empleado abre en su teléfono, y `/firmar/[signerId]`, el puente a EasyLex. Ninguna es "solo un redirect": `/firmar` sí pinta pantalla cuando no se puede continuar (ya firmado, o vencido), y `/solicitar` es una pantalla completa. Las dos autentican con el identificador de la URL, no con sesión, y viven fuera del route group `(operacion)`.
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

Revisa `docs/frontend.md` para no duplicar lo que ya existe. Las primitivas viven en **`src/ui/`** y las más usadas al construir estas pantallas son: `Screen` (encabezado de pantalla, con `lead`, acción principal y `back`), `Card` / `Stack` / `Sunken` / `BlockTitle` / `Datum`, `Status` y `CountTile`, `Empty` / `ErrorState` / `LoadingRows` / `LoadingTiles`, `ConfirmDialog`, `Button` y `ActionLink`, `SearchInput` y `useToast`.

No hay tabla compartida ni paginación compartida: cada pantalla trae la suya (`personas/page.tsx` la resuelve con enlaces en el servidor; `ofertas/_ui/paginacion.tsx` con botones en el cliente). Si necesitas una tabla, mira primero cómo la resuelven `personas/page.tsx` y `nomina/_ui/empleados-del-ciclo.tsx`.

Hay inconsistencias conocidas listadas al final de `docs/frontend.md` —el rebote de entradas escrito tres veces a mano, el nombre de la plantilla por omisión declarado en tres sitios, y dos traducciones distintas para el mismo valor de estado. No las repliques.

## Roles

`profiles.role` se aplica en el backend con `requireRole()` y en la UI: `solo_lectura` < `operaciones` < `admin`.

**Cómo gatear en la UI:**
- **No hay contexto de rol en el cliente.** Cada página lo resuelve en el servidor (`getCurrentActor()` + `hasRole`) y baja un booleano con nombre de la operación —`puedeOperar`— como prop. Así el rol viaja explícito y no por un canal invisible.
- Para deshabilitar un control: `disabled={!puedeOperar}` y **di el motivo en pantalla**, no solo en un `title`. Ver `nomina/_ui/acciones-ciclo.tsx`: "Tu rol no permite actualizar ni exportar este ciclo. Pídeselo a un administrador."
- Para ocultar navegación: marca la entrada con `soloAdmin` en `DESTINOS` (`src/ui/nav.tsx`). El filtro corre en el cliente, contra el rol que `(operacion)/layout.tsx` pasó a `Shell`.
- **Toda ruta admin-only necesita además un guard de servidor** (`layout.tsx` con `getCurrentActor` + `redirect`). Ocultar el enlace no protege la URL directa. Ver `src/app/(operacion)/ajustes/layout.tsx`, que además **no depende de `RBAC_ENFORCEMENT`**: en modo `warn` los endpoints dejan pasar a propósito para observar los logs, pero la pantalla no debe abrirse nunca para quien no es admin. Sin actor también se sale: ante la duda, el rol mínimo.

**Importante:** las piezas puras de rol (`UserRole`, `hasRole`) están en `@/lib/auth/roles-shared` (sin imports de servidor). Los componentes de cliente importan de ahí, nunca de `@/lib/auth/roles`, que arrastra `next/headers` al bundle.

Esto es UX: refleja el rol siempre, con independencia de `RBAC_ENFORCEMENT`. La barrera real es el backend.
