"use client";

import Link from "next/link";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { Card } from "@/ui/surface";
import { SPRING } from "@/ui/motion";

/**
 * Enlace con aspecto de botón.
 *
 * Existe para no meter un <button> dentro de un <a>: son dos controles
 * interactivos anidados y los lectores de pantalla no saben cuál anunciar. Las
 * clases replican a mano las de `src/ui/button.tsx`; si aquel cambia de forma,
 * este tiene que seguirlo.
 */
export function EnlaceAccion({
  href,
  children,
  tono = "secondary",
  tamano = "lg",
}: {
  href: string;
  children: ReactNode;
  tono?: "primary" | "secondary";
  tamano?: "sm" | "md" | "lg";
}) {
  const base =
    "relative inline-flex items-center justify-center gap-2.5 rounded-md font-semibold select-none " +
    "outline-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-action";
  const tonos = {
    primary: "bg-action text-white border-b-[3px] border-action-press hover:bg-action-hover",
    secondary: "bg-surface text-ink border border-line-strong hover:bg-surface-hover shadow-1",
  } as const;
  const tamanos = {
    sm: "h-11 px-4 text-[15px]",
    md: "h-12 px-5 text-[17px]",
    lg: "h-14 px-7 text-[19px]",
  } as const;

  return (
    <motion.span
      className="inline-block"
      whileHover={{ y: -1 }}
      whileTap={{ y: 2, scale: 0.99 }}
      transition={SPRING.snappy}
    >
      <Link href={href} className={`${base} ${tonos[tono]} ${tamanos[tamano]}`}>
        {children}
      </Link>
    </motion.span>
  );
}

/**
 * Un paso del envío.
 *
 * Los cuatro pasos viven en UNA sola pantalla y todos quedan siempre visibles y
 * modificables: no es un asistente que obliga a avanzar en línea recta. Lo que
 * cambia es el ACUSE de cada paso — el número se convierte en palomita cuando
 * queda resuelto — para que se lea de un vistazo qué falta sin tener que
 * recordar por dónde iba.
 */
export function Paso({
  numero,
  titulo,
  proposito,
  listo,
  resumen,
  children,
}: {
  numero: number;
  titulo: string;
  /** Qué se decide en este paso, en lenguaje de operador. */
  proposito: string;
  listo: boolean;
  /** Lo elegido, en una línea. Se muestra cuando el paso ya quedó resuelto. */
  resumen?: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <div className="mb-6 flex items-start gap-4">
        <motion.span
          aria-hidden="true"
          key={listo ? "listo" : "pendiente"}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={SPRING.snappy}
          className={
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[19px] font-bold " +
            (listo ? "bg-done-soft text-done" : "bg-action-soft text-action")
          }
        >
          {listo ? (
            <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.6">
              <path d="M4 10.5l4 4 8-9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            numero
          )}
        </motion.span>

        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold uppercase tracking-[0.07em] text-ink-3">
            Paso {numero} de 4
          </p>
          <h2 className="mt-0.5 text-[23px] font-bold leading-tight text-ink">{titulo}</h2>
          <p className="mt-1 text-[15px] leading-snug text-ink-3">
            {listo && resumen ? resumen : proposito}
          </p>
        </div>
      </div>

      {children}
    </Card>
  );
}

/**
 * Elección entre dos caminos (un ciclo entero o personas sueltas).
 * Botones grandes y etiquetados: nunca un interruptor sin texto.
 */
export function Alternativas<T extends string>({
  valor,
  opciones,
  onCambiar,
  etiqueta,
}: {
  valor: T;
  opciones: Array<{ valor: T; label: string; hint: string }>;
  onCambiar: (v: T) => void;
  etiqueta: string;
}) {
  return (
    <div role="radiogroup" aria-label={etiqueta} className="grid gap-3 sm:grid-cols-2">
      {opciones.map((o) => {
        const activa = o.valor === valor;
        return (
          <motion.button
            key={o.valor}
            type="button"
            role="radio"
            aria-checked={activa}
            onClick={() => onCambiar(o.valor)}
            whileHover={{ y: -2 }}
            whileTap={{ y: 1, scale: 0.99 }}
            transition={SPRING.snappy}
            className={
              "rounded-md border-2 p-4 text-left outline-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-action " +
              (activa
                ? "border-action bg-action-soft"
                : "border-line bg-surface hover:bg-surface-hover")
            }
          >
            <span className={`block text-[17px] font-bold ${activa ? "text-action" : "text-ink"}`}>
              {o.label}
            </span>
            <span className="mt-0.5 block text-[15px] leading-snug text-ink-3">{o.hint}</span>
          </motion.button>
        );
      })}
    </div>
  );
}

/** Fila seleccionable de una lista (un lote, una plantilla). */
export function FilaElegible({
  seleccionada,
  onSeleccionar,
  titulo,
  detalle,
  extra,
}: {
  seleccionada: boolean;
  onSeleccionar: () => void;
  titulo: ReactNode;
  detalle: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <motion.button
      type="button"
      aria-pressed={seleccionada}
      onClick={onSeleccionar}
      whileHover={{ y: -2 }}
      whileTap={{ y: 1, scale: 0.995 }}
      transition={SPRING.snappy}
      className={
        "flex w-full items-center gap-4 rounded-md border-2 px-4 py-4 text-left outline-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-action " +
        (seleccionada ? "border-action bg-action-soft" : "border-line bg-surface hover:bg-surface-hover")
      }
    >
      <span
        aria-hidden="true"
        className={
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 " +
          (seleccionada ? "border-action bg-action text-white" : "border-line-strong bg-surface")
        }
      >
        {seleccionada ? (
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M4 10.5l4 4 8-9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[17px] font-bold text-ink">{titulo}</span>
        <span className="mt-0.5 block truncate text-[15px] text-ink-3">{detalle}</span>
      </span>
      {extra ? <span className="shrink-0">{extra}</span> : null}
    </motion.button>
  );
}
