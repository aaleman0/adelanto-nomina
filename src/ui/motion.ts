import type { Transition, Variants } from "motion/react";

/**
 * TOKENS DE MOVIMIENTO — fuente única de verdad.
 *
 * Reglas que este módulo hace cumplir:
 * · Micro-interacción 120–250ms · transición de pantalla 300–600ms.
 * · Curvas con física (resortes) o easing natural. Nunca lineal.
 * · Solo se animan `transform` y `opacity` (60fps reales).
 * · Toda animación comunica algo: origen, destino, jerarquía o resultado.
 *
 * La versión reducida (prefers-reduced-motion) se aplica globalmente con
 * <MotionConfig reducedMotion="user">, que desactiva los desplazamientos y
 * conserva los cambios de opacidad. Ver src/ui/motion-provider.tsx.
 */

/** Duraciones en segundos (Motion trabaja en segundos). */
export const DUR = {
  tap: 0.12,
  fast: 0.16,
  base: 0.22,
  slow: 0.28,
  screen: 0.42,
} as const;

/** Retraso entre hijos de una lista escalonada. */
export const STAGGER = 0.045;

/** Distancias de desplazamiento, alineadas con --move-* de globals.css. */
export const MOVE = {
  sm: 6,
  md: 16,
  lg: 32,
} as const;

/** Curvas de easing (equivalentes a --e-* en CSS). */
export const EASE = {
  out: [0.22, 1, 0.36, 1],
  in: [0.55, 0, 1, 0.45],
  inOut: [0.65, 0, 0.35, 1],
} as const;

/** Resortes: la física por defecto del sistema. */
export const SPRING = {
  /** Controles pequeños: responde y asienta rápido. */
  snappy: { type: "spring", stiffness: 520, damping: 34, mass: 0.7 },
  /** Tarjetas y bloques: entrada con cuerpo. */
  soft: { type: "spring", stiffness: 320, damping: 32, mass: 0.9 },
  /** Elementos que viajan entre vistas (layoutId). */
  travel: { type: "spring", stiffness: 260, damping: 30, mass: 1 },
} satisfies Record<string, Transition>;

export const T = {
  tap: { duration: DUR.tap, ease: EASE.out },
  fast: { duration: DUR.fast, ease: EASE.out },
  base: { duration: DUR.base, ease: EASE.out },
  slow: { duration: DUR.slow, ease: EASE.out },
  screen: { duration: DUR.screen, ease: EASE.out },
} satisfies Record<string, Transition>;

/* ── Variantes reutilizables ─────────────────────────────────────────── */

/** Pantalla completa: entra desde abajo con profundidad; sale hacia atrás. */
export const screenVariants: Variants = {
  initial: { opacity: 0, y: MOVE.lg, scale: 0.985 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { ...T.screen } },
  exit: { opacity: 0, y: -MOVE.md, scale: 0.99, transition: { duration: DUR.base, ease: EASE.in } },
};

/** Contenedor que escalona a sus hijos (listas, tarjetas, bloques). */
export const staggerParent: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: STAGGER, delayChildren: 0.04 } },
  exit: {},
};

/** Hijo de una lista escalonada. */
export const staggerChild: Variants = {
  initial: { opacity: 0, y: MOVE.md },
  animate: { opacity: 1, y: 0, transition: SPRING.soft },
  exit: { opacity: 0, y: -MOVE.sm, transition: T.fast },
};

/** Fila de datos en vivo: entra deslizando, sale colapsando. */
export const rowVariants: Variants = {
  initial: { opacity: 0, x: -MOVE.md, height: 0 },
  animate: { opacity: 1, x: 0, height: "auto", transition: SPRING.soft },
  exit: { opacity: 0, x: MOVE.md, height: 0, transition: T.base },
};

/** Capa oscura de modales/drawers. */
export const scrimVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: T.base },
  exit: { opacity: 0, transition: T.fast },
};

/** Modal: crece desde el centro, con peso. */
export const modalVariants: Variants = {
  initial: { opacity: 0, scale: 0.94, y: MOVE.md },
  animate: { opacity: 1, scale: 1, y: 0, transition: SPRING.soft },
  exit: { opacity: 0, scale: 0.97, y: MOVE.sm, transition: T.fast },
};

/** Drawer lateral: entra desde el borde derecho. */
export const drawerVariants: Variants = {
  initial: { x: "100%" },
  animate: { x: 0, transition: SPRING.travel },
  exit: { x: "100%", transition: { duration: DUR.slow, ease: EASE.in } },
};

/** Aviso emergente: baja desde arriba con rebote corto. */
export const toastVariants: Variants = {
  initial: { opacity: 0, y: -MOVE.md, scale: 0.96 },
  animate: { opacity: 1, y: 0, scale: 1, transition: SPRING.snappy },
  exit: { opacity: 0, y: -MOVE.sm, scale: 0.98, transition: T.fast },
};

/** Tooltip / etiqueta flotante. */
export const popVariants: Variants = {
  initial: { opacity: 0, scale: 0.92, y: MOVE.sm },
  animate: { opacity: 1, scale: 1, y: 0, transition: { duration: DUR.fast, ease: EASE.out } },
  exit: { opacity: 0, scale: 0.96, transition: { duration: DUR.tap, ease: EASE.in } },
};

/**
 * Gestos estándar de un control accionable. `whileTap` hunde el control:
 * el operador siente que el clic entró incluso antes de que responda el server.
 */
export const pressable = {
  whileHover: { y: -2 },
  whileTap: { y: 1, scale: 0.985 },
  transition: SPRING.snappy,
} as const;

/** Éxito: sube y se asienta (movimiento ascendente = logrado). */
export const successVariants: Variants = {
  initial: { opacity: 0, scale: 0.8, y: MOVE.sm },
  animate: { opacity: 1, scale: 1, y: 0, transition: { type: "spring", stiffness: 480, damping: 22 } },
  exit: { opacity: 0, scale: 0.9, transition: T.fast },
};

/** Error: sacudida lateral corta (movimiento negativo = rechazo). */
export const errorVariants: Variants = {
  initial: { opacity: 0, x: 0 },
  animate: {
    opacity: 1,
    x: [0, -7, 6, -4, 0],
    transition: { x: { duration: 0.34, ease: EASE.inOut }, opacity: T.fast },
  },
  exit: { opacity: 0, transition: T.fast },
};

/** Nombres de layoutId compartidos entre vistas (elementos que viajan). */
export const SHARED = {
  employeeCard: (id: string) => `empleado-${id}`,
  cycleCard: (id: string) => `ciclo-${id}`,
  navIndicator: "nav-indicador",
} as const;
