---
name: adelantos-backoffice
description: Disenar o implementar el front interno del sistema de adelantos para visualizar evidencia operativa, importaciones, empleados, contratos, pagos, errores, logs y timelines por empleado. Use cuando Codex construya dashboards, tablas, filtros, detalle de empleado, vistas de auditoria, permisos basicos o pantallas administrativas simples para operacion masiva.
---

# Adelantos Backoffice

## Proposito

Usar esta skill para construir un panel interno simple, funcional y orientado a operacion sobre Supabase. El empleado nunca ve ni usa esta pagina; solo recibe mensajes por ManyChat y firma en EasyLex. En v1 puede operar sin login, dejando la estructura preparada para agregar Supabase Auth despues. Priorizar busqueda, filtros, evidencia y acciones claras sobre estetica decorativa.

## Alcance V1 Ajustado

La pagina interna no administra cuentas bancarias, pagos ni datos financieros operativos. Su funcion principal es controlar evidencia del flujo de contrato:

- A quien ya se le envio mensaje por ManyChat.
- Quien hizo clic o solicito.
- A quien se le genero contrato/link de firma.
- Que link sigue vigente o expiro.
- Quien firmo.
- Cuando paso cada movimiento.
- Que errores existen por empleado, mensaje, contrato o EasyLex.

## Vistas Minimas

- Dashboard: totales de mensajes enviados, solicitudes, contratos generados, links expirados, firmas y errores.
- Importaciones: subir CSV, ver lotes, errores por fila y resumen aplicado.
- Control de contratos: buscar por nombre, telefono, RFC, empresa, estado de mensaje y estado de firma.
- Contratos: filtrar por estado, ver link, contract_id, vigencia, timestamps y error.
- Logs: integraciones ManyChat, EasyLex, jobs y webhooks relacionados con contrato.
- Detalle de empleado: identidad minima, oferta, mensaje, contrato y timeline.

## Detalle De Empleado

Mostrar en una sola vista:

- Datos del empleado y contacto ManyChat.
- Oferta vigente y monto aprobado.
- Solicitud de contrato y link EasyLex.
- Estado de firma.
- Timeline de eventos importantes.
- Errores relacionados y acciones de reintento permitidas.

## Reglas De UX Operativa

- Disenar como consola administrativa interna, no como portal de usuario final.
- No crear paginas publicas para empleados.
- No mostrar instrucciones para empleados dentro del backoffice salvo plantillas/mensajes editables si se agregan despues.
- Usar tablas con filtros y paginacion server-side.
- Hacer que telefono, RFC y subscriber_id sean buscables.
- Mostrar estados con etiquetas consistentes.
- No mostrar CLABE, banco ni datos bancarios en las vistas principales.
- Mostrar payloads completos solo bajo expansion o vista tecnica.
- Evitar cargar miles de filas en el cliente.
- Incluir acciones con confirmacion cuando reintenten integraciones o regeneren links.

## Roles Iniciales

En v1, sin login ni roles activos. Mantener esta seccion como preparacion para una fase posterior.

- `admin`: ve todo y puede reintentar procesos.
- `operaciones`: ve empleados, contratos, mensajes e importaciones.
- `solo_lectura`: consulta evidencia.

## Supabase

- Usar Supabase Auth para usuarios del backoffice.
- Guardar roles en tabla de perfiles o claims controlados por backend.
- Usar Supabase Storage para CSVs importados y archivos auxiliares.
- No exponer service role key en el front.

## Referencias

Leer `references/vistas-backoffice.md` para estructura de pantallas y columnas.
Leer `../adelantos-arquitectura/references/fases-v1.md` para construir el backoffice en el orden acordado: primero lectura, despues contratos y acciones.
Leer `../adelantos-design-system/references/tokens.md` y `../adelantos-design-system/references/componentes.md` antes de implementar o refactorizar UI.
