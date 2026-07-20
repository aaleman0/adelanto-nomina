# Arquitectura

## Qué es este sistema

Un backoffice interno para operar adelantos de nómina masivos. **El empleado nunca entra a esta aplicación**: recibe un mensaje de WhatsApp, toca un botón, y firma en EasyLex. La app existe para que el equipo interno tenga control visual, evidencia y trazabilidad de ese proceso.

## Componentes y responsabilidades

| Componente | Responsabilidad | Qué **no** hace |
|---|---|---|
| **Backend (Next.js)** | Decide: elegibilidad, idempotencia, generación de contrato, orquestación | No conversa con el empleado |
| **Supabase Postgres** | Verdad operativa. Empleados, ofertas, solicitudes, contratos, logs | No aplica RLS — ver abajo |
| **Supabase Auth** | Sesión del equipo interno vía Google OAuth | No gestiona roles todavía |
| **Supabase Storage** | CSV originales (`imports`) y reportes (`import-reports`) | |
| **WhatsApp Cloud API (Meta)** | Entrega mensajes de plantilla y reporta estados | No decide a quién enviar |
| **EasyLex** | Muestra el contrato, capta la firma, emite evidencia | No valida elegibilidad |
| **Backoffice (esta app)** | Evidencia, filtros, timeline, acciones de reintento | No lo usa el empleado |

La regla que ordena todo: **Supabase es la fuente de verdad**. Los servicios externos reflejan estado, no lo definen.

## Flujo completo

```
CSV (Excel / Google Sheets)
  │
  ▼
POST /api/imports ────────► import_batches + raw_import_rows   (staging, no toca nada operativo)
  │
  ▼
POST /api/imports/[batchId]/apply
  │                        upsert por RFC → employees, employee_bank_accounts, advance_offers
  ▼
POST /api/whatsapp/bulk ──► valida elegibilidad → envía plantilla en lotes de 100
  │                        registra whatsapp_bulk_sends + whatsapp_contract_messages
  ▼
El empleado recibe el mensaje y toca el botón
  │
  ▼
POST /api/whatsapp/request-contract
  │   1. busca empleado por RFC
  │   2. valida oferta vigente + elegible + cuenta bancaria activa
  │   3. reutiliza solicitud/intento si ya existe (idempotencia)
  │   4. genera el PDF del contrato
  │   5. crea el documento en EasyLex
  │   6. guarda easylex_contract_id, signing_url, expires_at (+2 h)
  ▼
El empleado firma en EasyLex
  │
  ▼
POST /api/webhooks/easylex/sign  (eventType = DOCUMENT_SIGNED)
      contract_attempts → firmado
      contract_requests → firmado
      advance_offers    → firmada
      audit_events + integration_logs
```

El backoffice observa todo esto a través de la vista `backoffice_contract_control_v1`, que colapsa el estado a un único `operational_status` por empleado.

## Estado real del proyecto

| Área | Estado |
|---|---|
| Importación CSV (validación, staging, aplicación) | Funcionando |
| Backoffice de lectura y control de contratos | Funcionando |
| WhatsApp Cloud API (envío masivo, webhooks, historial, plantillas) | Funcionando |
| Autenticación con Google OAuth | Funcionando |
| Generación de PDF del contrato | Funcionando |
| EasyLex real (crear documento, obtener link de firma) | Funcionando, **apuntando a sandbox por defecto** |
| Confirmación de firma por webhook | Funcionando |
| Auditoría de teléfonos | Funcionando |
| Verificación de firma de webhooks (Meta y EasyLex) | Funcionando |
| Cabeceras de seguridad HTTP | Funcionando (CSP en modo report-only) |
| RLS en Supabase | Fase A: deny-all activo. Fase B (políticas por rol) pendiente |
| Roles y permisos | Implementado, en modo `warn` por defecto |
| Cola de envío masivo | Implementada (Cloud Tasks), desactivada por defecto |
| Pagos y CEP | **No existe código** |

> Documentación anterior describía EasyLex como "fase 8 pendiente" y el envío de mensajes vía ManyChat. Ambas cosas están obsoletas: ManyChat se retiró y EasyLex está integrado de verdad.

## Decisiones de diseño

### RFC como identidad
El empleado se identifica por RFC, no por teléfono. Si dos filas comparten teléfono, gana el RFC. Si el mismo RFC llega con otro teléfono, se actualiza el teléfono. `employees.rfc` es `UNIQUE`.

### Ofertas versionadas, no sobrescritas
Una reimportación sin cambios reales no crea nada. Con cambios, se crea una **nueva versión** de la oferta y la anterior queda `reemplazada` con `replaced_by_offer_id`. Un índice único parcial garantiza una sola oferta `is_current` por empleado. El motivo del cambio queda en `advance_offer_revisions`.

### Snapshot congelado del contrato
Al crear la solicitud se guarda `contract_snapshot` con los datos usados. Una importación posterior puede cambiar el monto del empleado sin alterar lo que ya se firmó.

### Intentos, no sobrescritura de links
Regenerar un link expirado crea un **nuevo `contract_attempts`** dentro de la misma solicitud. El historial de intentos queda íntegro. TTL del link: **2 horas** (`LINK_TTL_HOURS`).

### Idempotencia
- Solicitud de contrato: `UNIQUE (offer_id)` en `contract_requests`, más un índice único parcial que impide más de una solicitud activa por empleado.
- Webhook de EasyLex: índice único parcial sobre `easylex_events.event_id`.
- Importación: `UNIQUE (batch_id, row_number)`.

### Dos niveles de trazabilidad
`integration_logs` para depurar (payloads crudos, códigos HTTP). `audit_events` para dar soporte (resumen legible, estado anterior y nuevo, origen). No son lo mismo y no deben fusionarse.

### Los datos bancarios no llegan a la UI
La vista `backoffice_contract_control_v1` excluye deliberadamente la CLABE. Se lee solo durante la validación de elegibilidad y la generación del contrato.

## Riesgos arquitectónicos conocidos

Ninguno de estos es un bug aislado; son propiedades del diseño actual que conviene tener presentes.

1. **La cola existe pero no está activada.** El envío masivo soporta Cloud Tasks (una tarea por mensaje, con reintentos e idempotencia), pero por defecto sigue en modo inline dentro del request HTTP. Mientras no se configure GCP, un lote grande depende del timeout del entorno. Ver [WhatsApp](whatsapp.md#cola).
2. **RBAC arranca en modo `warn`.** Los roles se comprueban y se registran, pero no bloquean hasta poner `RBAC_ENFORCEMENT=enforce`. Es deliberado —todos los perfiles nacen como `solo_lectura`— pero mientras siga en `warn` la autorización sigue siendo efectivamente binaria.
3. **RLS sigue en fase A.** Deny-all activo, pero la app consulta con service role, así que las políticas por rol aún no son el punto de aplicación.
4. **No hay tipos generados de la base.** Los tipos son manuales; un cambio de esquema no rompe la compilación.
5. **El esquema difiere entre instalación nueva y migrada** en `whatsapp_contract_messages`.
6. **No hay rate limiting** en ningún endpoint.
7. **Quedan 3 helpers de auditoría duplicados** en `request-contract.ts`, `mock-sign.ts` e `imports/apply.ts`, pendientes de migrar al módulo compartido.

Los detalles de cada uno están en [Base de datos](base-de-datos.md#seguridad-y-control-de-acceso) y [API](api.md).

## Estructura del código

```
src/
  app/
    api/            route handlers (ver docs/api.md)
    auth/           callback y logout de OAuth
    contracts/      control de contratos + detalle + server actions
    imports/        pantalla de importación
    whatsapp/       dashboard, envío, historial, detalle de envío
    settings/       configuración de WhatsApp, plantillas, auditoría de teléfonos
    firmar/         redirector al link de firma de EasyLex
    login/          pantalla y acción de Google OAuth
    layout.tsx      único layout: fuentes, ToastProvider
    globals.css     tokens de diseño (Tailwind v4 CSS-first)
  components/
    ui/             primitivas: Button, Card, DataTable, StatusBadge, Toast…
    layout/         AppShell, SidebarFrame, UserControls
    contracts/      tabla, filtros, detalle, timeline
    whatsapp/       dashboard, historial, plantillas, send-flow (asistente de 5 pasos)
    imports/        formulario de subida, botón de aplicar
    dashboard/      cockpit de operación
  lib/
    supabase/       clientes: admin (service role), session (SSR), middleware
    whatsapp/       cliente Meta, elegibilidad, envío masivo, plantillas, webhooks, teléfonos
    contracts/      reglas de solicitud, acciones de backoffice, firma mock
    easylex/        cliente API, generación de PDF, monto en letra
    imports/        parseo y validación de CSV, aplicación del lote
    backoffice/     modelos de lectura sobre las vistas
    google/         generación alternativa de PDF vía Google Docs
    env.ts          validación con zod (único uso de zod)
    logger.ts       logging estructurado
  proxy.ts          gate de autenticación (convención Next.js 16)
supabase/migrations/  esquema, aplicado a mano en el SQL Editor
scripts/              utilidades ad hoc, no conectadas a package.json
tests/e2e/            Playwright: smoke, api, flows
```

Ver también: [API](api.md) · [Base de datos](base-de-datos.md) · [Frontend](frontend.md) · [Infraestructura](infraestructura.md)
