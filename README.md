# Adelanto Nómina

Backoffice interno para operar adelantos de nómina masivos: importación de CSV, envío por WhatsApp Cloud API, generación y firma de contratos con EasyLex, y evidencia operativa sobre Supabase.

**El empleado no usa esta aplicación.** Su experiencia ocurre en WhatsApp: recibe un mensaje, toca un botón, el backend valida su RFC y su oferta vigente, genera el contrato y le devuelve el link de firma. Esta app existe para que el equipo interno tenga control visual y trazabilidad de ese proceso.

## Qué hace

- Importa CSV exportados de Excel o Google Sheets, con validación y staging previo.
- Aplica las filas válidas a empleados, cuentas bancarias y ofertas, versionando los cambios.
- Envía mensajes masivos de WhatsApp a empleados elegibles usando plantillas aprobadas por Meta.
- Registra entrega y lectura por mensaje mediante webhooks.
- Genera el PDF del contrato y crea el documento de firma en EasyLex.
- Confirma la firma por webhook y actualiza contrato, solicitud y oferta.
- Expone control de contratos, filtros, detalle por empleado y timeline de eventos.
- Registra auditoría e integraciones para poder explicar qué pasó con cada empleado.

## Stack

Next.js 16.2.4 (App Router) · React 19.2.4 · TypeScript estricto · Supabase (Postgres, Auth, Storage) · Tailwind CSS v4 · Vitest · Playwright

## Arranque

```bash
pnpm install
cp .env.example .env.local   # completar valores
pnpm dev
```

Producción:

```bash
pnpm build
pnpm start
```

El esquema de base se aplica **manualmente**: pegar los archivos de `supabase/migrations/` en orden en el SQL Editor de Supabase. No hay `supabase db push` ni paso de migración automatizado.

Las variables mínimas son las de Supabase, WhatsApp y EasyLex. La lista completa, con cuáles son obligatorias y cuáles traen defaults peligrosos, está en [docs/configuracion.md](docs/configuracion.md).

## Pruebas

```bash
pnpm lint
pnpm typecheck
pnpm test:unit            # pnpm test corre en modo watch
pnpm test:e2e:smoke
pnpm test:e2e:flows
```

Lo anterior corre también en CI (`.github/workflows/ci.yml`), junto con build, escaneo de secretos y auditoría de dependencias.

Las pruebas E2E se autentican solas (crean un usuario de prueba y guardan la sesión), así que necesitan Supabase configurado en `.env.local`.

> `test:e2e:flows` **falla**: prueba una versión anterior de la UI y está pendiente de reescribir. `smoke` y `api` pasan, salvo 6 casos que necesitan las credenciales de Google para generar contratos. Ver [docs/testing.md](docs/testing.md).

## Documentación

Toda la documentación está en [`docs/`](docs/README.md), con un documento por tema y sin contenido duplicado.

| | |
|---|---|
| [Arquitectura](docs/arquitectura.md) | Componentes, flujo completo, decisiones, estado real |
| [Base de datos](docs/base-de-datos.md) | Esquema, enums, vistas, índices |
| [API](docs/api.md) | Todos los endpoints |
| [Frontend](docs/frontend.md) | Rutas, componentes, sistema de diseño |
| [Importación CSV](docs/importacion-csv.md) | Columnas, validación, reimportación |
| [WhatsApp](docs/whatsapp.md) | Integración y operación diaria |
| [EasyLex y contratos](docs/easylex-contratos.md) | Contrato, PDF, firma |
| [Configuración](docs/configuracion.md) | Variables, ajustes, checklist de producción |
| [Testing](docs/testing.md) | Suites, comandos, cobertura |
| [Scripts](docs/scripts.md) | Utilidades de `scripts/` |
| [Infraestructura](docs/infraestructura.md) | Despliegue (decidido, no implementado) |

## Estado

Funcionando: importación, backoffice, WhatsApp Cloud API, autenticación con Google, roles y permisos, generación de PDF, EasyLex real, confirmación de firma por webhook, verificación de firma de webhooks, cabeceras de seguridad y CI.

Implementado pero desactivado por defecto: la cola de envío masivo (Cloud Tasks) y la aplicación estricta de roles (`RBAC_ENFORCEMENT=warn`). Ambas se activan por configuración.

Pendiente: pagos y CEP (sin código), rate limiting, fase B de RLS, y el pipeline de despliegue.

Antes de operar en producción, revisar el [checklist de producción](docs/configuracion.md#checklist-antes-de-producción). Dos puntos que se pasan por alto con facilidad: hay variables que por defecto apuntan al **sandbox de EasyLex**, y la migración de RLS debe aplicarse a mano en la base de producción.
