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
3. **¿Necesita cola?** Hay una, apagada por defecto: `src/lib/queue` conmuta entre `inline` y Cloud Tasks según `QUEUE_DRIVER` y la configuración de GCP, y sin ella el envío masivo corre dentro del request HTTP. Si el trabajo puede tardar, dilo explícitamente en lugar de asumir que hay worker corriendo.
4. **¿Toca el esquema?** No hay tipos generados; los tipos de `src/lib/backoffice/contract-control.ts` se actualizan a mano y el compilador no avisa.
5. **¿Añade una ruta?** Todo lo que no esté en la lista pública de `src/proxy.ts` queda protegido por sesión. Es el comportamiento deseado — no lo eludas. Las excepciones ya listadas son las pantallas del empleado (`/solicitar/`, `/firmar/`), que se autentican con el identificador de la URL, no con cookie.
6. **¿Toca un plazo?** Son dos y no se derivan uno del otro: la ventana para PEDIR (`VENTANA_OFERTA_HORAS` en `src/lib/contracts/ventana-oferta.ts`, medida desde que salió la oferta) y la vida del ENLACE de firma (`LINK_TTL_HOURS` en `src/lib/contracts/link-ttl.ts`, medida desde que se generó el contrato). Hoy los dos valen 24 h por casualidad; hay una prueba que falla si alguien vuelve a atarlos.

## Riesgos vigentes

Enumerados en `docs/arquitectura.md`. Los dos que más condicionan un diseño nuevo: **la cola existe pero está apagada por defecto** (el envío masivo corre dentro del request HTTP hasta configurar Cloud Tasks) y **los roles se comprueban pero no bloquean** (`requireRole` registra la violación y deja pasar mientras `RBAC_ENFORCEMENT` no sea `enforce`, así que la autorización efectiva sigue siendo sesión sí/no).

## Coordinación con otras skills

`$adelantos-backend` (endpoints y reglas) · `$adelantos-importacion-csv` (carga masiva) · `$adelantos-easylex` (contratos y firma) · `$adelantos-backoffice` (pantallas internas) · `$adelantos-auditoria` (evidencia) · `$adelantos-design-system` (UI) · `$adelantos-testing` (validación)

> ManyChat se retiró del sistema. Si encuentras referencias, son legado del esquema y están documentadas como deuda en `docs/base-de-datos.md`.
