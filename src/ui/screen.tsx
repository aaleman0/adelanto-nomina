"use client";

import Link from "next/link";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { SPRING, staggerChild, staggerParent } from "./motion";

/**
 * Estructura de una pantalla.
 *
 * Cada pantalla resuelve UNA tarea, y lo declara en su encabezado:
 * · `title`  — la tarea, en verbo o sustantivo del oficio.
 * · `lead`   — una línea que explica qué se hace aquí (la interfaz enseña).
 * · `action` — la acción más frecuente, como elemento más grande y visible.
 * `back` siempre disponible en pantallas de detalle: volver atrás nunca se
 * pierde.
 */
export function Screen({
  title,
  lead,
  action,
  back,
  children,
}: {
  title: string;
  lead?: string;
  action?: ReactNode;
  back?: { href: string; label: string };
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[1400px] px-8 py-8">
      <motion.header
        variants={staggerParent}
        initial="initial"
        animate="animate"
        className="mb-8 flex flex-col gap-5"
      >
        {back ? (
          <motion.div variants={staggerChild}>
            <Link
              href={back.href}
              className="group inline-flex h-11 items-center gap-2 rounded-md px-3 -ml-3 text-[17px] font-semibold text-ink-2 hover:bg-paper-deep hover:text-ink"
            >
              <motion.span aria-hidden="true" className="inline-block" whileHover={{ x: -3 }} transition={SPRING.snappy}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                  <path d="M14 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </motion.span>
              {back.label}
            </Link>
          </motion.div>
        ) : null}

        <motion.div variants={staggerChild} className="flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0 max-w-2xl">
            <h1 className="text-[42px] font-bold leading-[1.08] tracking-[-0.022em] text-ink">{title}</h1>
            {lead ? <p className="mt-2.5 text-[19px] leading-relaxed text-ink-2">{lead}</p> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </motion.div>
      </motion.header>

      {children}
    </div>
  );
}

/** Rejilla de bloques amplios. Nunca comprime: si no cabe, baja. */
export function Grid({
  children,
  cols = "sm:grid-cols-2 xl:grid-cols-4",
  className = "",
}: {
  children: ReactNode;
  cols?: string;
  className?: string;
}) {
  return (
    <motion.div
      variants={staggerParent}
      initial="initial"
      animate="animate"
      className={`grid gap-4 ${cols} ${className}`}
    >
      {children}
    </motion.div>
  );
}
