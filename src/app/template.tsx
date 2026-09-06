"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { screenVariants } from "@/ui/motion";

/**
 * Transición de pantalla completa.
 *
 * `template.tsx` se re-monta en cada navegación (a diferencia de `layout.tsx`),
 * así que es el lugar correcto para animar la ENTRADA de cada vista: sube desde
 * abajo con una escala mínima, comunicando "esto es lo nuevo que llegó".
 *
 * No bloquea: la animación corre sobre transform/opacity y la página ya es
 * interactiva mientras ocurre.
 */
export default function Template({ children }: { children: ReactNode }) {
  return (
    <motion.div variants={screenVariants} initial="initial" animate="animate" className="h-full">
      {children}
    </motion.div>
  );
}
