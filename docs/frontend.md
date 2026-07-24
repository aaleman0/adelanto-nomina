# Frontend

Next.js 16.2.4 con App Router, React 19.2.4, Tailwind CSS v4, TypeScript en modo estricto.

## Rutas

Todas las páginas son **server components** salvo donde se indique; ninguna declara `'use client'`.

| Ruta | Archivo | Qué hace |
|---|---|---|
| `/` | `app/page.tsx` | Cockpit de operación. `force-dynamic`. Carga en paralelo `getContractControlData()`, `getDashboardKpis()` y los 6 movimientos más recientes. Todo en `try/catch` que degrada a vacío con banner de error |
| `/login` | `app/login/page.tsx` | Login con Google. Redirige a `/` si ya hay sesión. **No usa `AppShell`** |
| `/contracts` | `app/contracts/page.tsx` | Control de contratos. `force-dynamic`. Filtros `q`, `empleador`, `status`, `page` |
| `/contracts/[employeeId]` | `app/contracts/[employeeId]/page.tsx` | Detalle operativo y timeline. `notFound()` si no hay fila. Muestra banner según `?action_status=` |
| `/imports` | `app/imports/page.tsx` | Subida de CSV y últimos 20 lotes |
| `/whatsapp` | `app/whatsapp/page.tsx` | Dashboard (los datos los trae el cliente) |
| `/whatsapp/send` | `app/whatsapp/send/page.tsx` | Asistente de envío en 5 pasos |
| `/whatsapp/history` | `app/whatsapp/history/page.tsx` | Historial de envíos |
| `/whatsapp/bulk/[id]` | `app/whatsapp/bulk/[id]/page.tsx` | Detalle de un envío |
| `/settings` | `app/settings/page.tsx` | Stub (`PlaceholderPage`) |
| `/settings/whatsapp` | `app/settings/whatsapp/page.tsx` | Credenciales de WhatsApp |
| `/settings/whatsapp/templates` | `.../templates/page.tsx` | Plantillas de Meta |
| `/settings/whatsapp/phone-audit` | `.../phone-audit/page.tsx` | Auditoría de teléfonos |
| `/firmar/[signerId]` | `app/firmar/[signerId]/page.tsx` | No renderiza nada: `redirect()` al link de firma de EasyLex |

Las páginas de WhatsApp son cascarones estáticos; los datos los piden los componentes cliente. Las de contratos e importaciones cargan en el servidor.

## Autenticación

El gate está en **`src/proxy.ts`** — convención `proxy` de Next.js 16. **No existe `src/middleware.ts`**; buscarlo ahí es un error frecuente.

Rutas públicas: `/login`, `/auth/callback`, `/api/webhooks/*`, `/api/health*`. Cualquier otra redirige a `/login?next=<pathname>`. Un usuario con sesión que visita `/login` va a `/`.

El flujo es Google OAuth vía Supabase Auth: `signInWithGoogle` (server action) → Google → `/auth/callback` → sesión. El logout es `POST /auth/logout`, deliberadamente solo POST como mitigación de CSRF.

## Layout y estructura

**Un único layout**: `app/layout.tsx`. Carga tres fuentes de Google (`Manrope`, `Space Grotesk`, `IBM Plex Mono`), fija `<html lang="es">` y envuelve todo en `ToastProvider`.

El layout real de la aplicación es un **componente**, no un archivo de convención: `AppShell` (`components/layout/app-shell.tsx`), server component async que obtiene el usuario, define la navegación y envuelve en `NotificationsProvider` + `SidebarFrame`. Lo importan todas las páginas salvo `/login` y `/firmar`.

Navegación: Operación (`/`), Importar (`/imports`), Contratos (`/contracts`), grupo WhatsApp (Resumen, Nuevo envío, Historial, Plantillas, Conexión), Ajustes (`/settings`).

**Boundaries:** solo existe `app/whatsapp/error.tsx`. No hay `loading.tsx`, `not-found.tsx`, `global-error.tsx` ni layouts anidados. Tampoco hay route groups ni rutas paralelas.

> `app/whatsapp/error.tsx` desestructura `unstable_retry`, la API de Next 16, no el `reset` clásico. Al copiar este boundary a otra ruta hay que respetar esa firma.

Para errores fuera de las convenciones de archivo existe `components/error-boundary.tsx` (clase `ErrorBoundary`), usado por el dashboard de WhatsApp, el historial y el detalle.

## Componentes

### `layout/`
- **`app-shell.tsx`** — server. Shell, navegación, `PageHeader`, `PlaceholderPage`.
- **`sidebar-frame.tsx`** — client. Sidebar colapsable (72 ↔ 224 px) y drawer móvil. Persiste en `localStorage["backoffice-sidebar-collapsed"]` mediante un store propio con `useSyncExternalStore`.
- **`user-controls.tsx`** — client. Avatar, tarjeta de perfil y logout.

### `dashboard/`
- **`operations-cockpit.tsx`** — client. Tres columnas (señales / cola / detalle), filtrado local con `useDeferredValue` y barra de progreso firmados/total.

### `contracts/`
- `contract-control-dashboard.tsx` — server. Tres métricas: atención (pendientes + expirados), errores, firmados.
- `contract-control-filters.tsx` — server. Usa `<Form>` de `next/form`. 10 estados posibles.
- `contract-control-table.tsx` — server. Tabla en escritorio, tarjetas en móvil.
- `contract-detail-view.tsx` — server. Resumen, timeline y dos formularios de server action con `ConfirmSubmitButton`.
- `message-history.tsx` — client. Consulta `/api/whatsapp/messages/employee`.
- `search-input.tsx` — client. Empuja `?q=` con debounce.

### `whatsapp/`
- `whatsapp-dashboard.tsx`, `bulk-history.tsx`, `bulk-detail.tsx`, `templates-panel.tsx`, `phone-audit-panel.tsx` — todos client, con fetch propio.
- `status-badges.tsx` — server. `DeliveryBadge` y `BulkStatusBadge`.

### `whatsapp/send-flow/`
Asistente de 5 pasos, todo client salvo `types.ts`:

`guided-send-flow.tsx` (orquestador) · `recipient-step.tsx` · `employee-search-bar.tsx` · `message-template-step.tsx` · `eligibility-summary.tsx` · `send-confirmation.tsx` · `send-result.tsx`

### `imports/`
- `import-upload-form.tsx` — client. Sube el CSV y muestra columnas faltantes.
- `apply-import-button.tsx` — client. `window.confirm` y `router.refresh()`.

### `settings/`
- `whatsapp-config-form.tsx` — client. Credenciales y prueba de conexión.

## Sistema de diseño

### Primitivas (`components/ui/`)

**Server:** `button.tsx` (variantes `primary`, `secondary`, `ghost`, `danger`; prop `wave` que envuelve el texto en `LetterWave`), `card.tsx`, `data-table.tsx`, `status-badge.tsx` (`neutral`/`success`/`warning`/`danger`), `status-priority-badge.tsx`, `metric.tsx`, `empty-state.tsx`, `loading.tsx` (`Spinner`, `Skeleton`, `PageSkeleton`), `letter-wave.tsx`, `pagination-controls.tsx`.

**Client:** `toast.tsx`, `notifications.tsx`, `confirm-dialog.tsx`, `confirm-submit-button.tsx`, `safe-action-button.tsx`, `copy-link-button.tsx`, `scroll-progress-panel.tsx`.

`pagination-controls.tsx` es link-based (no client): `buildPageUrl` preserva los searchParams y omite `page=1`; `buildPageWindows` genera la elipsis y lista todas las páginas si son menos de 7.

### Tokens (`app/globals.css`)

Tailwind v4 **CSS-first**: un solo `@import "tailwindcss";`, **sin `tailwind.config`**. El plugin de PostCSS es `@tailwindcss/postcss`. No es shadcn — no hay `components.json` y todas las primitivas están escritas a mano.

Dos capas:

1. **`:root`** con los tokens crudos: rampa de marca `--color-1 #d4e1e8` → `--color-5 #2a3840`; superficies (`--background #edf3f6`, `--surface`, `--surface-muted`, `--surface-alt`); 7 variables de sidebar; texto (`--text-primary/secondary/muted/disabled/inverse`); semánticos `success`/`warning`/`danger`/`neutral`, cada uno con `-bg` y `-border`; rampas de dominio `--contract-*` (pending, message-sent, clicked, requested, generated, expired, signed, error) e `--import-*` (draft, uploading, validating, ready, applied, partial, error); bordes, links, `--overlay`, `--shadow`; radios `--radius-sm 5px` / `base 8px` / `lg 12px` / `xl 18px`.
2. **`@theme inline`** que mapea todo a los espacios de nombres de Tailwind, y es lo que hace válidas utilidades como `bg-surface`, `text-text-muted`, `border-border` o `rounded-base`. También define `--font-sans: var(--font-manrope)` y `--font-mono`.

Clases utilitarias propias: `.font-display` (Space Grotesk), `.font-data` (mono con `tabular-nums`), `.app-viewport` (`100dvh`), `.panel-scroll`, `.surface-panel` (superficie translúcida con `backdrop-filter: blur(16px)`), `.interactive-row`, `.button-contrast`, `.animate-fade-up`, `.letter-wave`, `.skeleton-bone`.

Animaciones `fadeSlideUp`, `letterBob` y `skeletonWave`, todas desactivadas bajo `prefers-reduced-motion: reduce`.

**No hay modo oscuro**: no existe selector `.dark` ni bloque `prefers-color-scheme`.

> La documentación anterior describía Comfortaa y una paleta en escala de grises. Eso ya no corresponde al código: las fuentes son Manrope / Space Grotesk / IBM Plex Mono y la paleta es una rampa azul pizarra.

## Estado en el cliente

No hay Redux, Zustand, Jotai ni React Query. Todo el estado remoto es `useState` + `fetch` en efectos, o props del servidor.

| Mecanismo | Dónde | Detalles |
|---|---|---|
| `ToastProvider` / `useToast` | `ui/toast.tsx`, en el layout raíz | Máximo 5 toasts, 5000 ms, variantes `success`/`error`/`warning`/`info`. Expone además un `toast.*` imperativo que **no hace nada si el provider no está montado** |
| `NotificationsProvider` / `useNotifications` | `ui/notifications.tsx`, dentro de `AppShell` | Persiste en `localStorage["app-notifications-v1"]`, tope 50, `useSyncExternalStore` con snapshot de servidor vacío para evitar desajustes de hidratación, sincronización entre pestañas por el evento `storage` |
| Colapso del sidebar | `layout/sidebar-frame.tsx` | Store propio con `useSyncExternalStore` |
| `useDebounce<T>` | `lib/hooks/use-debounce.ts` | Único archivo en `lib/hooks/` |

Como `NotificationsProvider` vive dentro de `AppShell`, **no está disponible en `/login` ni en `/firmar`**.

## Convenciones

- Los componentes de UI no conocen Supabase. Los datos llegan preparados.
- El fetching vive en server components o route handlers, no en componentes visuales.
- `'use client'` solo cuando hace falta interacción.
- Las tablas reciben datos listos; no aplican reglas de negocio.

## Inconsistencias conocidas

Reales y localizadas, útiles al tocar estas zonas:

1. **`useDebounce` está implementado tres veces**: el hook compartido en `lib/hooks/`, una copia local en `send-flow/employee-search-bar.tsx` y una tercera versión con `ref` de timer en `contracts/search-input.tsx`.
2. **`DEFAULT_TEMPLATE = "adelanto_nomina_v2"` está declarado dos veces**, en `guided-send-flow.tsx` y en `message-template-step.tsx`.
3. **Dos sistemas de badges conviven**: `ui/status-badge.tsx` usa tokens semánticos (`bg-surface-muted`, `text-text-secondary`), mientras `whatsapp/status-badges.tsx` y varios paneles usan clases crudas de Tailwind (`bg-emerald-50`, `text-amber-700`). Los colores no siempre coinciden.
4. **`phone-audit-panel.tsx` importa el tipo `PhoneAuditRow` desde el archivo del route handler**, acoplando un componente a una ruta de API.

Ver también: [Arquitectura](arquitectura.md) · [API](api.md) · [Testing](testing.md)
