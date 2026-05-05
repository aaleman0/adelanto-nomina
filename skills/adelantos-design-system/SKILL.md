---
name: adelantos-design-system
description: Aplicar y mantener el sistema visual del backoffice interno de adelantos, incluyendo colores, tipografia OracleSansVF, espaciado, radio, tono profesional, componentes compartidos, tokens CSS y buenas practicas de compartimentalizacion en Next.js. Use cuando Codex disene, refactorice o implemente UI, layout, tablas, botones, formularios o estados visuales de la app administrativa.
---

# Adelantos Design System

## Proposito

Usar esta skill para mantener la UI del backoffice consistente, profesional y facil de mantener. El usuario final nunca ve esta app; la audiencia son profesionales de negocio que necesitan control operativo.

## Principios

- Usar componentes compartidos antes de repetir clases en cada pantalla.
- Definir colores, spacing, tipografia y radios como tokens CSS.
- Mantener tono visual profesional, energia media y alta legibilidad.
- Diseñar para escaneo rapido: tablas claras, metricas discretas, estados visibles.
- Evitar decoracion innecesaria; priorizar control, evidencia y accion.
- No usar estilos inline salvo valores dinamicos inevitables.

## Tokens

Leer `references/tokens.md` para colores, fuentes, tipografia, spacing y radios.

## Estructura Recomendada

Leer `references/componentes.md` para organizar componentes en `src/components/ui`, `src/components/layout` y features como `src/components/imports`.
