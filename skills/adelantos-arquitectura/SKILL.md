---
name: adelantos-arquitectura
description: Diseñar, revisar o modificar la arquitectura del sistema masivo de adelantos por WhatsApp (WhatsApp Cloud API, EasyLex, backend Next.js, Supabase, importación CSV y backoffice). Use cuando haya que razonar sobre flujos completos, responsabilidades entre componentes, estados, volumen, idempotencia, auditoría, riesgos operativos o decisiones de arquitectura.
---

# Adelantos Arquitectura

Mapa principal del sistema. Úsala antes de tomar decisiones que crucen componentes.

## Lee primero

- `docs/arquitectura.md` — componentes, flujo completo, decisiones y riesgos.
- `docs/base-de-datos.md` — el modelo de datos es la referencia real, no la memoria.

No repitas aquí lo que está en `docs/`. Si un dato falta, agrégalo al documento correspondiente.

## Separación de responsabilidades

Mantenerla es la regla que más protege este sistema:

- **WhatsApp Cloud API** conversa con el empleado. No decide nada.
- **EasyLex** muestra la firma y emite evidencia. No valida elegibilidad.
- **El backend** decide: elegibilidad, idempotencia, generación, orquestación.
- **Supabase Postgres** conserva la verdad operativa.
- **El backoffice** muestra evidencia. El empleado nunca lo usa.

## Principios al diseñar

- Supabase es la fuente de verdad; los servicios externos reflejan estado, no lo definen.
- Nunca depender de Google Sheets en vivo: importar CSV a staging y normalizar hacia tablas operativas.
- Registrar eventos **antes y después** de llamar a una integración externa.
- Mantener trazabilidad por empleado, solicitud, contrato, importación y webhook.
- Separar decisiones legales de decisiones técnicas cuando haya firma, consentimiento o evidencia probatoria.
- Diseñar para volumen: paginación, idempotencia, reintentos y logs desde el inicio.

## Al proponer un cambio, verifica

1. **¿Rompe la idempotencia?** Las garantías viven en índices únicos parciales, no en el código. Revísalos en `docs/base-de-datos.md` antes de tocar el flujo de contratos.
2. **¿Altera un snapshot?** `contract_requests.contract_snapshot` congela lo firmado. No debe recalcularse.
3. **¿Necesita cola?** Hoy no hay ninguna: el envío masivo corre dentro del request HTTP. Si el trabajo puede tardar, dilo explícitamente en lugar de asumir que hay worker.
4. **¿Toca el esquema?** No hay tipos generados; los tipos de `src/lib/backoffice/contract-control.ts` se actualizan a mano y el compilador no avisa.
5. **¿Añade una ruta?** Todo lo que no esté en la lista pública de `src/proxy.ts` queda protegido por sesión. Es el comportamiento deseado — no lo eludas.

## Riesgos vigentes

Enumerados en `docs/arquitectura.md`. Los dos que más condicionan un diseño nuevo: **no existe capa de colas** (el envío masivo corre dentro del request HTTP) y **la autorización es binaria** (sesión sí/no, sin roles aplicados).

## Coordinación con otras skills

`$adelantos-backend` (endpoints y reglas) · `$adelantos-importacion-csv` (carga masiva) · `$adelantos-easylex` (contratos y firma) · `$adelantos-backoffice` (pantallas internas) · `$adelantos-auditoria` (evidencia) · `$adelantos-design-system` (UI) · `$adelantos-testing` (validación)

> ManyChat se retiró del sistema. Si encuentras referencias, son legado del esquema y están documentadas como deuda en `docs/base-de-datos.md`.
