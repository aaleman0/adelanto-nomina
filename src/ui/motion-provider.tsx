"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { T } from "./motion";

/**
 * Configuración global de movimiento.
 *
 * `reducedMotion="user"` respeta la preferencia del sistema operativo: cuando
 * el usuario pide menos movimiento, Motion desactiva los desplazamientos y las
 * escalas pero CONSERVA los cambios de opacidad, así que el feedback (qué
 * apareció, qué cambió) sigue comunicándose. Es la versión reducida completa,
 * no una app sin animación.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={T.base}>
      {children}
    </MotionConfig>
  );
}
