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

Tipografía: Manrope (cuerpo), Space Grotesk (`.font-display`), IBM Plex Mono (`.font-data`). Paleta: rampa azul pizarra `--color-1` → `--color-5`. **No hay modo oscuro.**

> Documentación anterior describía Comfortaa y una paleta en escala de grises. Está obsoleta.

## Principios

- Usar componentes compartidos antes de repetir clases en cada pantalla.
- Definir colores, spacing, tipografía y radios como tokens, nunca como valores sueltos.
- Tono profesional, energía media, alta legibilidad. La audiencia son profesionales de negocio.
- Diseñar para escaneo rápido: tablas claras, métricas discretas, estados visibles.
- Evitar decoración innecesaria; priorizar control, evidencia y acción.
- No usar estilos inline salvo valores dinámicos inevitables.

## Antes de crear un componente

Comprueba que no exista ya. Hay primitivas para botón, tarjeta, tabla, badge de estado, badge de prioridad, métrica, estado vacío, spinner, skeleton, paginación, toast, notificaciones, diálogo de confirmación y copiar link. La lista completa está en `docs/frontend.md`.

## Usa los tokens, no clases crudas

Prefiere `bg-surface`, `text-text-muted`, `border-border`, `rounded-base` sobre `bg-slate-100` o `text-gray-500`.

Esto importa porque **ya hay dos sistemas de badges conviviendo**: `ui/status-badge.tsx` usa tokens semánticos mientras `whatsapp/status-badges.tsx` y varios paneles usan clases crudas de Tailwind, con colores que no siempre coinciden. Al tocar esas zonas, converge hacia los tokens en lugar de añadir una tercera variante.

Existen rampas de dominio ya definidas: `--contract-*` (pending, message-sent, clicked, requested, generated, expired, signed, error) e `--import-*` (draft, uploading, validating, ready, applied, partial, error). Úsalas para estados en vez de inventar colores.

## Reglas de estructura

- `src/components/ui` — primitivas compartidas, **sin conocimiento de Supabase**.
- `src/components/layout` — estructura general (`AppShell`, `SidebarFrame`, `PageHeader`).
- `src/components/<feature>` — componentes específicos de cada área.
- `src/lib` — lógica server-side, parsing, Supabase y reglas de negocio.

Mantén el fetching en server components o route handlers, no dentro de componentes visuales. Usa `'use client'` solo cuando haga falta interacción. Las tablas reciben datos ya preparados; no aplican reglas de negocio.

## Accesibilidad

Respeta `prefers-reduced-motion`: las animaciones existentes ya se desactivan bajo esa preferencia. Mantén el anillo de foco visible (`:focus-visible` está definido globalmente).
