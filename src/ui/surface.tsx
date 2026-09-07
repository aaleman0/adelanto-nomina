"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { staggerChild, staggerParent, SPRING } from "./motion";

/**
 * Superficies del sistema.
 *
 * La jerarquía es física: la página es el fondo hundido, la tarjeta es un
 * objeto elevado sobre él. Un bloque = un asunto. Nunca se anidan tarjetas
 * dentro de tarjetas: para separar por dentro se usa `Sunken`.
 */

/** Tarjeta: la unidad de contenido. Entra escalonada dentro de un `Stack`. */
export function Card({
  children,
  className = "",
  interactive = false,
  as = "section",
}: {
  children: ReactNode;
  className?: string;
  /** Añade respuesta al puntero. Solo si la tarjeta entera es accionable. */
  interactive?: boolean;
  as?: "section" | "article" | "div";
}) {
  const Comp = motion[as];
  return (
    <Comp
      variants={staggerChild}
      className={
        `rounded-lg bg-surface p-6 shadow-1 ` +
        (interactive ? "cursor-pointer " : "") +
        className
      }
      whileHover={interactive ? { y: -3, boxShadow: "var(--shadow-2)" } : undefined}
      whileTap={interactive ? { y: 0, scale: 0.995 } : undefined}
      transition={SPRING.soft}
    >
      {children}
    </Comp>
  );
}

/** Contenedor que escalona la entrada de sus hijos (tarjetas, filas, bloques). */
export function Stack({
  children,
  className = "",
  gap = "gap-5",
}: {
  children: ReactNode;
  className?: string;
  gap?: string;
}) {
  return (
    <motion.div
      variants={staggerParent}
      initial="initial"
      animate="animate"
      className={`flex flex-col ${gap} ${className}`}
    >
      {children}
    </motion.div>
  );
}

/** Zona hundida dentro de una tarjeta (para datos secundarios o listas). */
export function Sunken({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-md bg-paper-deep p-4 ${className}`}>{children}</div>;
}

/**
 * Encabezado de un bloque. `hint` explica el bloque en lenguaje de operador:
 * la interfaz enseña, no asume que alguien capacitó al usuario.
 */
export function BlockTitle({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-[23px] font-bold leading-tight text-ink">{title}</h2>
        {hint ? <p className="mt-1 text-[15px] leading-snug text-ink-3">{hint}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** Dato suelto con su etiqueta. La etiqueta va arriba, siempre visible. */
export function Datum({
  label,
  value,
  mono = false,
  tone = "normal",
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  tone?: "normal" | "strong" | "muted";
}) {
  const toneClass =
    tone === "strong" ? "text-[31px] font-bold leading-none" : tone === "muted" ? "text-ink-3" : "text-ink";
  return (
    <div className="min-w-0">
      <p className="text-[13px] font-semibold uppercase tracking-[0.07em] text-ink-3">{label}</p>
      <p className={`mt-1.5 ${mono ? "font-mono tabular" : ""} ${toneClass} truncate`}>{value}</p>
    </div>
  );
}
