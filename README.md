# Adelanto Nomina

Backoffice interno para operar un flujo masivo de adelantos de nomina por WhatsApp usando WhatsApp Cloud API (Meta), backend propio en Next.js, Supabase como base operativa y EasyLex para contratos y firma.

El empleado final no usa esta aplicacion. La experiencia del empleado vive en WhatsApp: recibe un mensaje, toca el link de firma, el backend valida su RFC y su oferta vigente, genera o reutiliza un contrato y devuelve el link de firma. Esta app existe para que el equipo interno tenga control visual, evidencia operativa y trazabilidad del proceso.

## Que hace este proyecto

- Importa CSV exportados desde Sheets o Excel.
- Valida y normaliza datos antes de aplicarlos.
- Actualiza empleados, ofertas y estados operativos en Supabase.
- Envia mensajes masivos de WhatsApp via WhatsApp Cloud API a empleados elegibles.
- Registra estado de entrega y lectura por mensaje.
- Expone el endpoint `POST /api/manychat/request-contract` para el flujo de solicitud de contrato.
- Genera contratos mock con expiracion de 2 horas para pruebas funcionales.
- Recibe firma mock por webhook para simular el cierre del contrato.
- Muestra un backoffice con control de contratos, filtros, detalle por empleado y timeline de eventos.
- Registra logs e historial en tablas de auditoria e integracion.

## Stack

- `Next.js 16`
- `React 19`
- `TypeScript`
- `Supabase`
- `Playwright`
- `Vitest`
- `Tailwind CSS v4`

## Flujo Operativo

1. Se importa un CSV con empleados y ofertas.
2. El sistema valida columnas, normaliza datos y guarda staging.
3. Se aplican filas validas a tablas operativas.
4. El equipo interno lanza un envio masivo desde el backoffice via WhatsApp Cloud API.
5. El empleado recibe el mensaje de WhatsApp.
6. El empleado toca el link de solicitud.
7. El backend valida elegibilidad, evita duplicados y genera o reutiliza un intento de contrato.
8. Se devuelve un `link_easylex` al empleado por WhatsApp.
9. El backoffice muestra mensaje enviado, solicitud, link, expiracion, firma y errores.

## Mensajes WhatsApp por estado del backend

**`contract_ready`:**
```
Tu contrato esta listo para firma.
Link: {{link_easylex}}
Expira: {{expires_at}}
```

**`already_signed`:**
```
Tu contrato ya fue firmado correctamente. No es necesario volver a solicitarlo.
```

**`not_found`:**
```
No encontramos una oferta disponible para este RFC. Por favor contacta a RRHH.
```

**`not_eligible`:**
```
Tu oferta no esta disponible para solicitar adelanto. Por favor contacta a RRHH.
```

**`no_offer`:**
```
No hay una oferta vigente para generar contrato. Por favor contacta a RRHH.
```

**`invalid_request`:**
```
Hubo un error al procesar tu solicitud. Por favor intenta de nuevo o contacta a RRHH.
```

## Estado Por Fases

| Fase | Descripcion | Estado |
|------|-------------|--------|
| 0 | Preparacion: Next.js + Supabase | Completada |
| 1 | Base de datos: schema y migraciones | Completada |
| 2 | Importacion CSV: validacion y staging | Completada |
| 3 | Aplicacion de datos: upsert a tablas operativas | Completada |
| 4 | Backoffice de lectura | Completada |
| 5 | Contratos mock: endpoint, elegibilidad, links | Completada |
| 6 | Backoffice de contratos: control, timeline, acciones | Completada |
| 7 | WhatsApp Cloud API: envio masivo, webhooks, historial, UI | **Completada** |
| 8 | EasyLex real: API real, contract_id, signing_url | Pendiente |
| 9 | Confirmacion de firma: webhook o polling EasyLex | Pendiente |
| 10 | Operacion y pulido: metricas, auth, export, pagos/CEP | Pendiente |

## Lo que falta para produccion completa

1. **EasyLex real (Fase 8)** — conectar con la API real de EasyLex para generar contratos reales.
2. **Confirmacion de firma real (Fase 9)** — webhook o polling para actualizar contratos a `firmado`.
3. **Operacion y pulido (Fase 10)** — Supabase Auth, roles, export de errores, pagos y CEP.

## Estructura Principal

- `src/app/page.tsx`: dashboard principal
- `src/app/whatsapp/`: modulo WhatsApp (dashboard, envio, historial, bulk)
- `src/app/contracts/[employeeId]/page.tsx`: detalle operativo por empleado
- `src/app/api/manychat/request-contract/route.ts`: endpoint de solicitud de contrato
- `src/app/api/whatsapp/bulk/route.ts`: envio masivo
- `src/app/api/webhooks/whatsapp/route.ts`: webhook de estados Meta
- `src/app/api/webhooks/easylex/mock-sign/route.ts`: webhook mock de firma
- `src/app/api/health/whatsapp/route.ts`: health check de WhatsApp
- `src/lib/contracts/request-contract.ts`: reglas de negocio del contrato
- `src/lib/whatsapp/`: cliente, elegibilidad, templates, bulk send, webhooks
- `src/lib/contracts/backoffice-actions.ts`: regeneracion y reintento desde backoffice
- `supabase/migrations/`: schema base y migraciones
- `tests/e2e/`: pruebas E2E por compartimento (smoke, api, flows, whatsapp)
- `docs/whatsapp-operator-guide.md`: guia de operador para WhatsApp Cloud API

## Desarrollo Local

Instalar dependencias:

```bash
pnpm install
```

Levantar desarrollo:

```bash
pnpm dev
```

Build de produccion:

```bash
pnpm build
pnpm start
```

## Variables De Entorno

Se necesita un archivo `.env.local` con al menos:

```bash
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_WEBHOOK_VERIFY_TOKEN=
WHATSAPP_APP_SECRET=
WHATSAPP_BUSINESS_NUMBER=
```

El proyecto tambien acepta `SUPABASE_SECRET_KEY` como fallback local para facilitar arranques en entorno compartido.

## Pruebas

Lint:

```bash
pnpm lint
```

TypeScript:

```bash
pnpm exec tsc --noEmit
```

Unit tests (Vitest):

```bash
pnpm test
```

Playwright completo:

```bash
pnpm test:e2e
```

Playwright por compartimento:

```bash
pnpm test:e2e:smoke
pnpm test:e2e:api
pnpm test:e2e:flows
pnpm exec playwright test tests/e2e/whatsapp
```

## Verificar configuracion de WhatsApp

```bash
pnpm exec ts-node scripts/verify-whatsapp-setup.ts
```

O via endpoint:

```bash
curl https://tu-dominio.com/api/health/whatsapp
```

## Siguiente Paso Natural

El siguiente bloque de trabajo es la integracion real con EasyLex (Fase 8): confirmar el plan/API contratado, construir el payload real, guardar `easylex_contract_id` y `signing_url` real, y manejar el webhook o polling de confirmacion de firma.
