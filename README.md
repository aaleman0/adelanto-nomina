# Adelanto Nomina

Backoffice interno para operar un flujo masivo de adelantos de nomina por WhatsApp usando ManyChat, backend propio en Next.js, Supabase como base operativa y EasyLex para contratos y firma.

El empleado final no usa esta aplicacion. La experiencia del empleado vive en WhatsApp: recibe un mensaje, toca `SOLICITA AQUI`, el backend valida su RFC y su oferta vigente, genera o reutiliza un contrato y devuelve el link de firma. Esta app existe para que el equipo interno tenga control visual, evidencia operativa y trazabilidad del proceso.

## Que hace este proyecto

- Importa CSV exportados desde Sheets o Excel.
- Valida y normaliza datos antes de aplicarlos.
- Actualiza empleados, ofertas y estados operativos en Supabase.
- Expone el endpoint `POST /api/manychat/request-contract` para el flujo de ManyChat.
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
- `Tailwind CSS v4`

## Flujo operativo

1. Se importa un CSV con empleados y ofertas.
2. El sistema valida columnas, normaliza datos y guarda staging.
3. Se aplican filas validas a tablas operativas.
4. ManyChat envia broadcast a empleados elegibles.
5. El empleado toca `SOLICITA AQUI`.
6. ManyChat llama al backend con `subscriber_id`, telefono y RFC.
7. El backend valida elegibilidad, evita duplicados y genera o reutiliza un intento de contrato.
8. Se devuelve un `link_easylex` al flujo conversacional.
9. El backoffice muestra mensaje enviado, solicitud, link, expiracion, firma y errores.

## Flujo detallado en ManyChat

El flujo conversacional en ManyChat funciona así:

**1. Mensaje inicial (WhatsApp):**
- ManyChat envía un broadcast a empleados elegibles
- Mensaje: "Adelanto de nómina desde tu celular"
- Incluye: `First Name`, `Empleado`, `Monto Prestamo Autorizado`
- Botón: "SOLICITA AQUÍ"

**2. External Request al backend:**
- URL: `POST /api/manychat/request-contract`
- Payload enviado:
  - `subscriber_id`: ID del contacto en ManyChat
  - `rfc`: RFC del empleado
  - `telefono_normalizado`: Teléfono normalizado
  - `first_name`, `last_name`: Nombre del empleado
- Response mapping:
  - `last_backend_status` ← `status`
  - `link_easylex` ← `link_easylex`

**3. Condiciones basadas en `last_backend_status`:**

- **Si `contract_ready`:**
  - Enviar mensaje con el link de firma
  - Mostrar: `last_backend_status` y `link_easylex`

- **Si `already_signed`:**
  - Enviar mensaje: "Tu contrato ya fue firmado correctamente. No es necesario volver a solicitarlo."

- **Otros estados (`not_found`, `not_eligible`, `no_offer`):**
  - Enviar mensaje de error correspondiente al `message` del backend

**Variables de ManyChat utilizadas:**
- `First Name`: Nombre del usuario
- `Empleado`: Nombre del empleado o empresa
- `Monto Prestamo Autorizado`: Cantidad del préstamo
- `last_backend_status`: Estado devuelto por el backend
- `link_easylex`: Enlace al contrato devuelto por el backend

**Mensajes sugeridos para ManyChat:**

**Cuando el backend está caído (error de conexión):**
```
Lo sentimos, tenemos problemas técnicos en este momento. Por favor intenta más tarde o contacta a RRHH.
```

**Para cada estado del backend:**

**`contract_ready`:**
```
✅ Tu contrato está listo para firma.
📄 Link: {{link_easylex}}
⏰ Expira: {{expires_at}}
```

**`already_signed`:**
```
✅ Tu contrato ya fue firmado correctamente. No es necesario volver a solicitarlo.
```

**`not_found`:**
```
❌ No encontramos una oferta disponible para este RFC. Por favor contacta a RRHH.
```

**`not_eligible`:**
```
❌ Tu oferta no está disponible para solicitar adelanto. Por favor contacta a RRHH.
```

**`no_offer`:**
```
❌ No hay una oferta vigente para generar contrato. Por favor contacta a RRHH.
```

**`invalid_request`:**
```
❌ Hubo un error al procesar tu solicitud. Por favor intenta de nuevo o contacta a RRHH.
```

## Estado actual

- `Fase 0` a `Fase 6`: listas
- `Fase 7 ManyChat real`: ✅ **funcional y probado** - External Request, response mapping y condiciones operando correctamente
- `EasyLex real`: pendiente
- `Webhook real de firma EasyLex`: pendiente

Hoy el proyecto ya tiene integrado:

- importacion y aplicacion de CSV
- control visual de contratos
- endpoint ManyChat funcional y probado en producción
- integración ManyChat con response mapping y condiciones operativas
- contratos mock
- firma mock
- acciones operativas desde backoffice para regenerar link y reintentar flujo
- pruebas E2E para estados, idempotencia, expiracion, firma y acciones internas

## Estructura principal

- `src/app/page.tsx`: dashboard principal
- `src/app/contracts/[employeeId]/page.tsx`: detalle operativo por empleado
- `src/app/api/manychat/request-contract/route.ts`: endpoint de solicitud desde ManyChat
- `src/app/api/webhooks/easylex/mock-sign/route.ts`: webhook mock de firma
- `src/lib/contracts/request-contract.ts`: reglas de negocio del contrato
- `src/lib/contracts/backoffice-actions.ts`: regeneracion y reintento desde backoffice
- `supabase/migrations/0001_initial_schema.sql`: schema base
- `supabase/migrations/0002_contract_control_backoffice.sql`: vistas y control operativo
- `tests/e2e`: pruebas funcionales y E2E

## Desarrollo local

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

## Variables de entorno

Se necesita un archivo `.env.local` con al menos:

```bash
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
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

Playwright completo:

```bash
pnpm exec playwright test
```

## Siguiente paso natural

El siguiente bloque grande de trabajo es reemplazar el contrato mock por la integracion real con EasyLex y conectar la confirmacion de firma real hacia Supabase y ManyChat.
