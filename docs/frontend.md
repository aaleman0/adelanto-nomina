# Frontend

Next.js 16.3.5 con App Router, React 19.2.4, Tailwind CSS v4, TypeScript en modo estricto. Las animaciones son de **Motion** (`motion/react`), que es dependencia de producción: la importan doce de los trece archivos de `src/ui/`.

## Rutas

Todas las páginas son **server components**; ninguna declara `'use client'`. Lo interactivo baja a componentes cliente vecinos, en carpetas privadas (`_ui/`, `_pendientes/`).

Todo lo que exige sesión vive bajo el route group **`(operacion)`**, que no aparece en la URL pero aporta el marco común: barra lateral, barra superior, `error.tsx` y `loading.tsx`. Las dos pantallas que abre el empleado —`/solicitar/[token]` y `/firmar/[signerId]`— y el acceso `/login` quedan FUERA del grupo a propósito: no llevan marco ni sesión de backoffice.

| Ruta | Archivo | Qué hace |
|---|---|---|
| `/` | `app/(operacion)/page.tsx` | Pendientes: la cola de expedientes donde el operador es el bloqueo (`error`, `link_expirado`, `pendiente_envio`), agrupada por urgencia, con tope de 50 filas. `force-dynamic`. Si falla la cola relanza y la atrapa el `error.tsx` del grupo; si fallan los KPIs la pantalla sigue en pie |
| `/nomina` | `app/(operacion)/nomina/page.tsx` | Carga del CSV del periodo y lista de ciclos. `force-dynamic`. La lista va en un `<Suspense>` aparte para que la zona de carga esté viva desde el primer instante |
| `/nomina/[loteId]` | `app/(operacion)/nomina/[loteId]/page.tsx` | Detalle de un ciclo: quién firmó, acciones del ciclo y descarga del Excel. `force-dynamic`. Banner según `?action_status=` |
| `/ofertas` | `app/(operacion)/ofertas/page.tsx` | Asistente de envío en **4 pasos**. El servidor solo resuelve el rol; el asistente entero es cliente |
| `/ofertas/historial` | `app/(operacion)/ofertas/historial/page.tsx` | Envíos anteriores. Los filtros y la página viven en la URL, así que la lista es cliente dentro de `<Suspense>` |
| `/ofertas/[envioId]` | `app/(operacion)/ofertas/[envioId]/page.tsx` | Detalle de un envío. Resuelve `params` y baja el id a un componente cliente, que pagina contra `/api/whatsapp/bulk/detail` |
| `/personas` | `app/(operacion)/personas/page.tsx` | El archivo completo de expedientes. `force-dynamic`. Filtros `q`, `empleador`, `status`, `page` |
| `/personas/[empleadoId]` | `app/(operacion)/personas/[empleadoId]/page.tsx` | Expediente y línea de tiempo. `notFound()` si no hay fila. Banner según `?action_status=` |
| `/ajustes` | `app/(operacion)/ajustes/page.tsx` | Índice de ajustes. Todo el subárbol es **solo admin**, con guard de servidor en su `layout.tsx` |
| `/ajustes/empresa` | `.../ajustes/empresa/page.tsx` | Datos del acreedor que se imprimen en cada contrato |
| `/ajustes/whatsapp` | `.../ajustes/whatsapp/page.tsx` | Diagnóstico y configuración de la conexión con Meta |
| `/ajustes/plantillas` | `.../ajustes/plantillas/page.tsx` | Plantillas de Meta, solo lectura |
| `/ajustes/telefonos` | `.../ajustes/telefonos/page.tsx` | Auditoría y corrección de teléfonos |
| `/login` | `app/login/page.tsx` | Login con Google. Redirige a `/` si ya hay sesión. Fuera de `(operacion)`: sin marco |
| `/solicitar/[token]` | `app/solicitar/[token]/page.tsx` | Auto-servicio del empleado, diseñado para teléfono. Autentica con el token firmado del enlace |
| `/firmar/[signerId]` | `app/firmar/[signerId]/page.tsx` | Puente a EasyLex: redirige si el enlace sirve, pero **sí pinta pantalla** cuando no se puede continuar (ya firmado, o vencido) |

Ajustes, el asistente de ofertas y las listas que filtran desde la URL traen sus datos desde el cliente. Pendientes, nómina y personas cargan en el servidor.

## Autenticación

El gate está en **`src/proxy.ts`** — convención `proxy` de Next.js 16. **No existe `src/middleware.ts`**; buscarlo ahí es un error frecuente.

Rutas públicas: `/login`, `/auth/callback`, `/api/webhooks/*`, `/api/health*`, `/api/tasks/*` y los dos prefijos de pantalla del empleado, `/solicitar/` y `/firmar/`. Cualquier otra redirige a `/login?next=<pathname>`. Un usuario con sesión que visita `/login` va a `/`.

No son rutas abiertas, son rutas con OTRA autenticación: los webhooks se validan por firma o secreto compartido, los workers de `/api/tasks/` por el token OIDC de Cloud Tasks, y las pantallas del empleado por el identificador imposible de adivinar que viaja en la URL (token HMAC en `/solicitar`, `signerId` validado contra `contract_attempts` en `/firmar`). El empleado no tiene cuenta en el backoffice: si estas rutas entraran al gate de sesión, el enlace de firma lo mandaría a un `/login` donde nunca podrá entrar.

El flujo es Google OAuth vía Supabase Auth: `signInWithGoogle` (server action) → Google → `/auth/callback` → sesión. El logout es `POST /auth/logout`, deliberadamente solo POST como mitigación de CSRF.

## Layout y estructura

**Tres `layout.tsx` en todo el árbol.** `app/layout.tsx` es el raíz: carga dos fuentes de Google —`Figtree` para todo y `JetBrains_Mono` solo para datos que se comparan carácter a carácter (RFC, CLABE, folios, columnas numéricas)—, fija `<html lang="es">` y envuelve en `MotionProvider`. `app/(operacion)/layout.tsx` es el del backoffice: resuelve actor y usuario y los pasa a `Shell`. El tercero es el de Ajustes, y existe por el guard de admin (ver abajo).

`Shell` (`ui/shell.tsx`) es **cliente**: barra lateral fija + barra superior + contenido, y es quien monta `ToastProvider` y `OfflineBanner`. El gate de sesión no es suyo: lo aplica `src/proxy.ts` antes de llegar aquí, y esta capa solo resuelve identidad y rol para pintar la navegación que corresponde.

`app/template.tsx` anima la entrada de cada vista. Es `template.tsx` y no `layout.tsx` a propósito: se re-monta en cada navegación, que es justo lo que permite animar la llegada de la pantalla nueva.

Navegación (`ui/nav.tsx`): Pendientes (`/`), Nómina (`/nomina`), Ofertas (`/ofertas`), Personas (`/personas`) y Ajustes (`/ajustes`, marcado `soloAdmin` y filtrado contra el rol que baja del layout). Los destinos son las etapas del ciclo real de trabajo, no los módulos del sistema: cargar la nómina → ofrecer → dar seguimiento.

**Boundaries:** `app/(operacion)/error.tsx` y `app/(operacion)/loading.tsx` cubren todo el backoffice de una vez, y `app/not-found.tsx` la ruta inexistente. No hay `global-error.tsx` ni rutas paralelas. El único layout anidado es `app/(operacion)/ajustes/layout.tsx`, y existe para el guard de admin.

> `app/(operacion)/error.tsx` desestructura `unstable_retry`, la API de Next 16, no el `reset` clásico: además de limpiar el boundary vuelve a pedir los datos al servidor. Al copiar este boundary a otra ruta hay que respetar esa firma.

Ya no hay una clase `ErrorBoundary` propia. Las vistas que cargan datos desde el cliente resuelven su fallo dentro del propio componente, con `ErrorState` de `ui/states.tsx` o `ErrorRecargable` en `personas/_ui/`.

## Componentes

**`src/components/` ya no existe.** Lo compartido está en `src/ui/` y lo de cada pantalla vive junto a su ruta, en una carpeta privada (`_ui/`, `_pendientes/`) que el App Router no convierte en URL. Todos los archivos de esas carpetas son client components.

### `(operacion)/_pendientes/`
- `atajos.tsx` — `AmbitoDeAtajos` apaga los atajos mientras haya un diálogo abierto (una tecla no debe sacar al operador de una confirmación sin contestar); `AtajosPendientes` los publica en la barra del pie.
- `accion-en-lote.tsx` — acción sobre varios expedientes contra `/api/backoffice/contracts/batch`.

### `(operacion)/nomina/_ui/`
- `cargar-nomina.tsx` — sube el CSV a `/api/imports` y lo aplica con `/api/imports/[batchId]/apply`.
- `empleados-del-ciclo.tsx` — quién firmó en el ciclo, filtrable sin recargar.
- `acciones-ciclo.tsx` — actualizar estados y descargar el Excel (`/api/cycles/[cycleId]/export`).
- `comun.ts` — formato de dinero, enteros y fechas.

### `(operacion)/ofertas/_ui/`
Asistente de **4 pasos**: `enviar-ofertas.tsx` (orquestador) · `paso-destinatarios.tsx` · `paso-plantilla.tsx` · `paso-revision.tsx`. `paso.tsx` aporta el marco de cada paso (`Paso`) y las piezas que comparten (`EnlaceAccion`, `Alternativas`, `FilaElegible`). El cuarto paso —confirmar y enviar— queda fijo en su columna mientras se recorren los otros tres, porque nada de esto se puede deshacer.

También aquí: `historial-envios.tsx`, `detalle-envio.tsx`, `paginacion.tsx` y `formato.ts`, que concentra los tipos, las traducciones de estado propias de la sección y un `pedirJson` con el contrato `{ok:...}` del backend ya resuelto.

### `(operacion)/personas/_ui/`
- `buscador.tsx` — empuja `?q=` con un `setTimeout` propio.
- `contadores.tsx` — conteos por estado, que funcionan como filtros.
- `linea-de-tiempo.tsx` — la línea de tiempo del expediente.
- `historial-whatsapp.tsx` — consulta `/api/whatsapp/messages/employee`.
- `acciones-expediente.tsx` — los cinco server actions del expediente (pedir, regenerar enlace, reintentar, reenviar firmado, comprobar firma) con `ConfirmDialog`, más la descarga del PDF firmado.
- `error-recargable.tsx` · `vocabulario.ts` — error con reintento, y el vocabulario de la sección.

### `(operacion)/ajustes/_ui/`
`formulario-acreedor.tsx` · `panel-conexion.tsx` · `lista-plantillas.tsx` · `auditoria-telefonos.tsx`, los cuatro con fetch propio a través de `red.ts`, más `sub-navegacion.tsx`, que solo navega.

> `red.ts` traduce el fallo del servidor a lenguaje de operador y conserva el texto crudo en `detalle`, en segundo plano. Ajustes es la única sección de admin: sin el motivo real de Meta, un fallo de credenciales es imposible de resolver.

## Sistema de diseño

### Primitivas (`src/ui/`)

**Todos los componentes son client components** y declaran `'use client'`: el sistema se apoya en Motion para que cada cambio de estado se vea, y eso solo corre en el cliente.

- `button.tsx` — `Button` (variantes `primary`, `secondary`, `quiet`, `danger`; tamaños `sm`/`md`/`lg`; `loading` y `done` se transforman DENTRO del mismo botón con el ancho reservado, para que el layout no salte al enviar un formulario) y `ActionLink`.
- `field.tsx` — `Field`, `TextInput`, `SelectInput`, `SearchInput`, `CheckField`.
- `surface.tsx` — `Card`, `Stack`, `Sunken`, `BlockTitle`, `Datum`. Las tarjetas no se anidan: para separar por dentro se usa `Sunken`.
- `screen.tsx` — `Screen` (título, `lead`, acción principal y `back`) y `Grid`.
- `status.tsx` — `Status`, `CountTile` y `describeStatus`.
- `states.tsx` — `Empty`, `ErrorState`, `LoadingRows`, `LoadingTiles`, `SuccessNote`, `ProblemNote`, `OfflineBanner`, `AsyncSwitch`.
- `overlay.tsx` — `Modal`, `ConfirmDialog`, `Drawer`.
- `toast.tsx` — `ToastProvider` y `useToast`.
- `shortcuts.tsx` — `useShortcut`, `Key`, `ShortcutBar`.
- `nav.tsx` — `Sidebar` y el tipo `Rol`. `shell.tsx` — `Shell`. `motion-provider.tsx` — `MotionProvider`. `motion.ts` — los tokens de movimiento.

La paginación NO es una primitiva compartida: hay dos, cada una dentro de su pantalla. La de `personas/page.tsx` son enlaces resueltos en el servidor (preserva los searchParams y omite `page=1`); la de `ofertas/_ui/paginacion.tsx` es cliente.

> `describeStatus` (`ui/status.tsx`) es donde se traduce el valor crudo de la base al lenguaje del operador —"link_generado" no significa nada en piso; "Falta que firme" sí—. Si una pantalla inventa su propia etiqueta, el mismo estado se lee distinto según dónde lo mires.

### Tokens (`app/globals.css`)

Tailwind v4 **CSS-first**: un solo `@import "tailwindcss";`, **sin `tailwind.config`**. El plugin de PostCSS es `@tailwindcss/postcss`. No es shadcn — no hay `components.json` y todas las primitivas están escritas a mano.

El sistema se llama **"Tablero de operación"** y la cabecera de `globals.css` dice de dónde sale cada decisión: operador de piso, pantalla grande, luz fuerte, turnos largos, posiblemente sin capacitación. De ahí el contraste alto sobre base gris-azulada, los objetivos de clic de 44 px para arriba, la tipografía grande — y la regla que manda sobre el color: **nunca es decorativo, siempre codifica estado.** Azul = acción · ámbar = requiere atención · verde = terminado · rojo = falló.

Dos capas:

1. **`:root`** con los tokens crudos: base neutra (`--paper #eef1f6`, `--paper-deep`, `--surface #ffffff`, `--surface-hover`, `--line`, `--line-strong`); tinta (`--ink`, `--ink-2`, `--ink-3`, `--ink-on-dark`); azul de acción (`--action #0050c8` con `-hover`, `-press`, `-soft`, `-line`); estados del TRABAJO —nunca de la persona— `--wait` / `--attention` / `--done` / `--failed`, cada uno con `-soft` y `-line`, más `--attention-fill` para el punto; radios `--r-xs 8px` → `--r-xl 28px`; sombras `--shadow-1/2/3` tintadas con el azul de la base, no con negro; espaciado `--s-1 4px` → `--s-8 64px`; y los tokens de movimiento (`--d-*` duraciones, `--e-*` curvas, `--move-*` distancias).
2. **`@theme inline`** que mapea todo a los espacios de nombres de Tailwind, y es lo que hace válidas utilidades como `bg-surface`, `text-ink-2`, `border-line` o `rounded-md`. También define `--font-sans: var(--font-figtree)`, `--font-mono: var(--font-jetbrains)` y la escala tipográfica (`--text-caption 13px` → `--text-display 42px`), grande a propósito para leerse a un brazo de distancia.

Clases utilitarias propias, solo tres: `.tabular` (números alineados en columna), `.skeleton` (esqueleto de carga con barrido) y `.live-dot` (punto que late, reservado a trabajo en curso).

**Los tokens de movimiento están duplicados a propósito**: en CSS (`--d-*`, `--e-*`, `--move-*`) y en TypeScript (`DUR`, `EASE`, `MOVE`, `SPRING` en `ui/motion.ts`, que trabaja en segundos porque así los quiere Motion). Si cambias una duración en un lado, cámbiala en el otro: nada lo verifica.

Bajo `prefers-reduced-motion: reduce` el feedback **no se apaga**: `globals.css` colapsa duraciones y distancias a ~0 y `<MotionConfig reducedMotion="user">` quita desplazamientos y escalas pero conserva la opacidad, así que el operador sigue viendo qué cambió.

**No hay modo oscuro**: no existe selector `.dark` ni bloque `prefers-color-scheme`.

> Las fuentes son **Figtree** (todo) y **JetBrains Mono** (solo RFC, CLABE, folios y columnas numéricas). Cualquier documento que mencione Comfortaa, Manrope, Space Grotesk o IBM Plex Mono está describiendo un rediseño anterior.

## Estado en el cliente

No hay Redux, Zustand, Jotai ni React Query. Todo el estado remoto es `useState` + `fetch` en efectos, o props del servidor.

Tampoco se guarda nada en `localStorage`: no queda una sola llamada en `src/`. El backoffice no recuerda nada entre sesiones del navegador.

| Mecanismo | Dónde | Detalles |
|---|---|---|
| `ToastProvider` / `useToast` | `ui/toast.tsx`, montado dentro de `Shell` | Tonos `done` / `failed` / `info`. La duración depende del caso: 9000 ms si el aviso trae "Deshacer" (hay que alcanzar a reaccionar), 8000 ms si es un fallo, 4500 ms el resto. `useToast` **lanza** si no hay provider: es un error de programación, no un caso a tolerar |
| Atajos de teclado | `ui/shortcuts.tsx` | `useShortcut` registra un atajo global y se ignora mientras el foco está en un campo de texto, salvo Escape. Regla del sistema: si un atajo existe se VE en pantalla, con `<Key>` junto al control que dispara |
| Sin conexión | `ui/states.tsx` (`OfflineBanner`) | Barra fija arriba, con los eventos `online`/`offline` de la ventana. Aparece y se va sola |
| Rol | `(operacion)/layout.tsx` → `Shell` → `Sidebar` | Baja como prop desde el servidor. No hay contexto de rol en el cliente |

Como `ToastProvider` vive dentro de `Shell`, **no está disponible en `/login`, `/solicitar` ni `/firmar`**.

`src/lib/hooks/use-debounce.ts` sigue en el repo pero **ya no lo importa nadie**: las tres pantallas que rebotan entradas usan un `setTimeout` propio.

## Convenciones

- Los componentes de UI no conocen Supabase. Los datos llegan preparados.
- El fetching vive en server components o route handlers, no en componentes visuales.
- `'use client'` solo cuando hace falta interacción.
- Las tablas reciben datos listos; no aplican reglas de negocio.

## Inconsistencias conocidas

Reales y localizadas, útiles al tocar estas zonas:

1. **El rebote de entradas está escrito tres veces a mano**: `personas/_ui/buscador.tsx`, `ofertas/_ui/detalle-envio.tsx` (350 ms) y `ofertas/_ui/paso-destinatarios.tsx`, cada una con su propio `setTimeout`, mientras `lib/hooks/use-debounce.ts` existe y no lo usa nadie.
2. **El nombre de la plantilla por omisión está declarado tres veces**: `PLANTILLA_POR_OMISION` en `ofertas/_ui/paso-plantilla.tsx`, `DEFAULT_BULK_TEMPLATE` en `lib/whatsapp/message-builder.ts` y un literal suelto en `lib/whatsapp/bulk-send.ts`. Hoy los tres dicen `"adelanto_nomina_v2"` y nada obliga a que sigan coincidiendo.
3. **Los mismos valores crudos se traducen distinto en dos lugares.** `describeStatus` (`ui/status.tsx`) es el mapa general, pero `ofertas/_ui/formato.ts` tiene el suyo para el estado de un envío masivo: `pending` es "Todavía no sale" en uno y "En espera" en el otro; `failed` es "No se pudo enviar" o "Falló el envío" según por dónde entres. Al añadir un estado, revisa los dos.
4. **Hay dos paginaciones y ninguna es compartida**: la de `personas/page.tsx` (enlaces, en el servidor) y la de `ofertas/_ui/paginacion.tsx` (botones, en el cliente). Si necesitas una tercera pantalla paginada, extrae una antes de copiar.

El problema de los badges con clases crudas de Tailwind (`bg-emerald-50`, `text-amber-700`) **ya no existe**: no queda ninguna en `src/app` ni en `src/ui`, todo pasa por los tokens. Se anota aquí porque varias skills siguen advirtiendo de él.

Ver también: [Arquitectura](arquitectura.md) · [API](api.md) · [Testing](testing.md)
