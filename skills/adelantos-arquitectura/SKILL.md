---
name: adelantos-arquitectura
description: Disenar, revisar o modificar la arquitectura del sistema masivo de adelantos por WhatsApp usando ManyChat, EasyLex, backend propio, base de datos, importacion CSV y backoffice operativo. Use cuando Codex necesite razonar sobre flujos completos, responsabilidades entre componentes, estados, volumen, idempotencia, auditoria, riesgos operativos o decisiones de arquitectura.
---

# Adelantos Arquitectura

## Proposito

Usar esta skill como mapa principal del sistema. Mantener separadas las responsabilidades: ManyChat conversa con el empleado, EasyLex muestra la firma al empleado, el backend decide, Supabase Postgres conserva la verdad operativa y el backoffice interno muestra evidencia.

## Principios

- Tratar Supabase Postgres como fuente de verdad. ManyChat solo refleja campos utiles para conversar.
- Evitar depender de Google Sheets en vivo. Importar CSV a staging y normalizar hacia tablas operativas.
- Disenar para uso masivo: colas, jobs, paginacion, idempotencia, reintentos y logs desde el inicio.
- Registrar eventos importantes antes y despues de llamar integraciones externas.
- Mantener trazabilidad por empleado, solicitud, contrato, pago, importacion y webhook.
- Separar decisiones legales de decisiones tecnicas cuando haya firma, consentimiento o evidencia probatoria.

## Flujo Base

1. Importar CSV exportado desde Excel o Google Sheets.
2. Guardar lote y filas crudas.
3. Validar y normalizar telefono, RFC, monto, empresa y estatus.
4. Hacer upsert a empleados, ofertas y datos operativos.
5. Enviar broadcast desde ManyChat a empleados activos.
6. Recibir clic en `Solicitalo aqui` mediante External Request al backend.
7. Validar elegibilidad e idempotencia.
8. Crear contrato o solicitud de firma en EasyLex.
9. Guardar `contract_id`, `signing_url` y estado.
10. Responder o actualizar ManyChat con el link.
11. Recibir webhook de firma desde EasyLex.
12. Actualizar contrato, empleado, ManyChat y timeline.
13. Cargar o actualizar pagos y CEP.
14. Responder `AYUDA` desde la base de datos.
15. Mostrar evidencia en backoffice.

## Componentes

- `ManyChat`: broadcasts, botones, palabra clave `AYUDA`, campos custom y External Requests.
- `Backend`: endpoints, reglas, workers, colas, integraciones, idempotencia y logs.
- `EasyLex`: contrato, firma, evidencia contractual, link y webhooks.
- `Supabase Postgres`: empleados, ofertas, solicitudes, contratos, imports, eventos y errores.
- `Supabase Auth`: acceso al backoffice y roles iniciales.
- `Supabase Storage`: CSVs importados y evidencia/documentos auxiliares cuando aplique.
- `Backoffice interno`: dashboard, busqueda, detalle por empleado, timeline, errores y acciones operativas. El empleado nunca usa esta pagina.

## Coordinacion Con Otras Skills

- Usar `$adelantos-importacion-csv` para disenar carga masiva y normalizacion.
- Usar `$adelantos-manychat` para payloads, campos y conversaciones.
- Usar `$adelantos-easylex` para contratos y firma.
- Usar `$adelantos-backend` para endpoints, jobs y reglas.
- Usar `$adelantos-pagos-cep` para dispersion, pagos y consultas `AYUDA`.
- Usar `$adelantos-backoffice` para pantallas internas.
- Usar `$adelantos-auditoria` para evidencia, logs y trazabilidad.

## Referencias

Leer `references/overview.md` cuando se necesite el mapa de entidades, estados y eventos base.
Leer `references/fases-v1.md` antes de implementar para seguir el orden de construccion por fases.
Leer `references/modelo-supabase-v1.md` para el modelo de datos acordado.
Leer `references/enums-v1.md` para estados iniciales.
