---
name: adelantos-design-system
description: Aplicar y mantener el sistema visual del backoffice de adelantos: tokens CSS, tipografía, espaciado, radios, componentes compartidos y compartimentalización en Next.js. Use cuando se diseñe, refactorice o implemente UI, layout, tablas, botones, formularios o estados visuales de la app administrativa.
---

# Adelantos Design System

## Lee primero

`docs/frontend.md` — la sección de sistema de diseño tiene los tokens reales, las primitivas existentes y las inconsistencias conocidas.

La fuente de verdad de los tokens es **`src/app/globals.css`**, no esta skill ni ningún documento. Si hay discrepancia, gana el CSS.

## Contexto

Tailwind v4 **CSS-first**: un solo `@import "tailwindcss";` y **sin `tailwind.config`**. Los tokens se declaran en `:root` y se exponen como utilidades mediante `@theme inline`. No es shadcn: todas las primitivas están escritas a mano.

Tipografía: **Figtree** para todo y **JetBrains Mono** solo para datos que se comparan carácter a carácter (RFC, CLABE, folios) y columnas numéricas; para alinear cifras en columna está la utilidad `.tabular`. No existen `.font-display` ni `.font-data`.

Paleta: base neutra gris-azulada (`--paper`, `--surface`, `--line`) + tinta (`--ink`, `--ink-2`, `--ink-3`) + un azul de acción (`--action`) + cuatro estados del trabajo (`--wait`, `--attention`, `--done`, `--failed`). No hay rampa de marca numerada. **No hay modo oscuro.**

> Si un documento menciona Comfortaa, una escala de grises, Manrope, Space Grotesk o IBM Plex Mono, describe un rediseño anterior. Manda `src/app/globals.css`.

## Principios

- Usar componentes compartidos antes de repetir clases en cada pantalla.
- Definir colores, spacing, tipografía y radios como tokens, nunca como valores sueltos.
- Alta legibilidad por encima de todo: la audiencia es un **operador de piso** —pantalla grande, luz fuerte, turnos largos, posiblemente sin capacitación—, no un profesional de oficina. De ahí se derivan las reglas concretas: cuerpo de 17 px, nada clicable por debajo de 44 px de alto, y la interfaz enseña (cada pantalla y cada bloque explican en una línea qué se hace ahí).
- Diseñar para escaneo rápido: tablas claras, métricas discretas, estados visibles.
- Evitar decoración innecesaria; priorizar control, evidencia y acción.
- No usar estilos inline salvo valores dinámicos inevitables.

## Antes de crear un componente

Comprueba que no exista ya. Hay primitivas para botón y enlace-acción, campos (texto, select, búsqueda, casilla), tarjeta y zona hundida, encabezado de pantalla y rejilla, etiqueta de estado y conteo, estado vacío, error, esqueletos de carga, avisos en línea, banner de sin conexión, modal, diálogo de confirmación, drawer, toast y atajos de teclado. La lista completa está en `docs/frontend.md`.

No existen —y no se han echado en falta— tabla compartida, badge de prioridad, métrica, spinner ni copiar-link. El esqueleto de carga sustituyó al spinner a propósito: refleja la forma de lo que viene, así que el operador sabe qué va a aparecer y dónde antes de que llegue.

## Usa los tokens, no clases crudas

Prefiere `bg-surface`, `text-ink-2`, `text-ink-3`, `border-line`, `rounded-md` sobre `bg-slate-100` o `text-gray-500`. Los radios son `rounded-xs` / `sm` / `md` / `lg` / `xl`; no hay `rounded-base`.

Esto importa porque una clase de Tailwind que no corresponde a ningún token **no falla: simplemente no pinta nada**. `text-text-muted` o `rounded-base` compilan y se van a producción invisibles.

Hoy no queda ninguna clase cruda de la paleta de Tailwind (`bg-emerald-50`, `text-amber-700`) en `src/app` ni en `src/ui`: el sistema está convergido. No abras la primera excepción.

Los estados NO se colorean a mano. Hay cinco tonos y uno solo los elige: `describeStatus` en `src/ui/status.tsx` traduce el valor crudo de la base a `{label, tone}` con `tone` en `wait` / `progress` / `done` / `attention` / `failed`, y `<Status value={...} />` lo pinta. Para añadir un estado, agrega su llave al mapa; no inventes ni un color ni una etiqueta en la pantalla.

Dos reglas que ese componente hace cumplir: el color **nunca viaja solo** (cada estado lleva forma —punto lleno, hueco, anillo latiendo— y palabra, para que se lea con daltonismo y bajo luz fuerte), y el estado describe **el trabajo, nunca a la persona que opera**.

## Reglas de estructura

- `src/ui` — primitivas compartidas, **sin conocimiento de Supabase**. Incluye la estructura general: `Shell`, `Sidebar` y `Screen`.
- `src/app/(operacion)/<área>/_ui/` — componentes de una sola pantalla, junto a su ruta. El guion bajo es lo que impide que la carpeta se convierta en URL.
- `src/lib` — lógica server-side, parsing, Supabase y reglas de negocio.

La regla para decidir: si dos áreas lo van a usar, va a `src/ui`; si es de una pantalla, se queda junto a ella. Sacar algo a `src/ui` antes de tener el segundo uso es cómo se acumulan primitivas que nadie usa.

Mantén el fetching en server components o route handlers, no dentro de componentes visuales. Usa `'use client'` solo cuando haga falta interacción. Las tablas reciben datos ya preparados; no aplican reglas de negocio.

## Accesibilidad

Respeta `prefers-reduced-motion`, pero ojo con el cómo: las animaciones **no se apagan**, se reducen. `globals.css` colapsa duraciones y distancias a ~0 y `<MotionConfig reducedMotion="user">` quita desplazamientos y escalas **conservando la opacidad**. Es deliberado: el feedback de qué apareció y qué cambió tiene que seguir llegando, así que una animación nueva debe seguir comunicando algo cuando solo le quede el fundido. Mantén el anillo de foco visible (`:focus-visible` está definido globalmente, con 3 px del azul de acción).
