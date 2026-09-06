"use client";

import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import type { ReactNode, ComponentProps } from "react";
import { SPRING, T, successVariants } from "./motion";

/**
 * Botón del sistema.
 *
 * Decisiones para operador de piso:
 * · Alto mínimo 48px (56px en `lg`): objetivo de clic amplio, sin precisión fina.
 * · El primario tiene un borde inferior sólido más oscuro → se lee como una
 *   tecla física que se hunde al presionar (`whileTap` baja 2px y quita el borde).
 * · SIEMPRE lleva texto. El icono es opcional y decorativo; nunca va solo.
 * · `loading` y `done` se transforman EN EL MISMO botón, con ancho reservado,
 *   así el layout no salta al enviar un formulario.
 */

type Variant = "primary" | "secondary" | "quiet" | "danger";
type Size = "sm" | "md" | "lg";

const base =
  "relative inline-flex items-center justify-center gap-2.5 rounded-md font-semibold " +
  "select-none disabled:cursor-not-allowed disabled:opacity-50 " +
  "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-action";

const variants: Record<Variant, string> = {
  primary: "bg-action text-white border-b-[3px] border-action-press hover:bg-action-hover",
  secondary: "bg-surface text-ink border border-line-strong hover:bg-surface-hover shadow-1",
  quiet: "bg-transparent text-ink-2 hover:bg-paper-deep hover:text-ink",
  danger: "bg-failed text-white border-b-[3px] border-[#8f1f19] hover:brightness-110",
};

const sizes: Record<Size, string> = {
  sm: "h-11 px-4 text-[15px]",
  md: "h-12 px-5 text-[17px]",
  lg: "h-14 px-7 text-[19px]",
};

type ButtonProps = {
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  /** Muestra progreso dentro del propio botón (sin saltos de layout). */
  loading?: boolean;
  /** Muestra confirmación tras completar. Vuelve solo al estado normal. */
  done?: boolean;
  /** Texto mostrado mientras `loading`. Por defecto conserva el original. */
  loadingLabel?: string;
  /** Texto mostrado en `done`. */
  doneLabel?: string;
  full?: boolean;
} & Omit<ComponentProps<typeof motion.button>, "children">;

export function Button({
  children,
  variant = "secondary",
  size = "md",
  icon,
  loading = false,
  done = false,
  loadingLabel,
  doneLabel = "Listo",
  full = false,
  className = "",
  disabled,
  ...rest
}: ButtonProps) {
  const busy = loading || done;

  return (
    <motion.button
      type="button"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${base} ${variants[variant]} ${sizes[size]} ${full ? "w-full" : ""} ${className}`}
      // El botón se hunde al presionar: confirma el clic antes que el servidor.
      whileHover={disabled || busy ? undefined : { y: -1 }}
      whileTap={disabled || busy ? undefined : { y: 2, scale: 0.99 }}
      transition={SPRING.snappy}
      {...rest}
    >
      {/* El contenido se cruza en el mismo espacio: el ancho no cambia. */}
      <AnimatePresence mode="popLayout" initial={false}>
        {done ? (
          <motion.span
            key="done"
            variants={successVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="inline-flex items-center gap-2"
          >
            <CheckMark />
            {doneLabel}
          </motion.span>
        ) : loading ? (
          <motion.span
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={T.fast}
            className="inline-flex items-center gap-2.5"
          >
            <Spinner />
            {loadingLabel ?? children}
          </motion.span>
        ) : (
          <motion.span
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={T.fast}
            className="inline-flex items-center gap-2.5"
          >
            {icon ? <span aria-hidden="true" className="shrink-0">{icon}</span> : null}
            {children}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

/**
 * Enlace con forma de botón. Lo que NAVEGA debe ser un `<a>`, no un `<button>`:
 * así el operador puede abrirlo en otra pestaña, copiar la dirección o usar el
 * botón central del ratón. Comparte estilo y respuesta al tacto con `Button`
 * para que no haya dos lenguajes visuales para la misma acción.
 */
const MotionLink = motion.create(Link);

export function ActionLink({
  href,
  children,
  variant = "primary",
  size = "md",
  icon,
  full = false,
  className = "",
  ...rest
}: {
  href: string;
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  full?: boolean;
  className?: string;
} & Omit<ComponentProps<typeof MotionLink>, "href" | "children" | "className">) {
  return (
    <MotionLink
      href={href}
      className={`${base} ${variants[variant]} ${sizes[size]} ${full ? "w-full" : ""} no-underline ${className}`}
      whileHover={{ y: -1 }}
      whileTap={{ y: 2, scale: 0.99 }}
      transition={SPRING.snappy}
      {...rest}
    >
      {icon ? <span aria-hidden="true" className="shrink-0">{icon}</span> : null}
      {children}
    </MotionLink>
  );
}

/** Progreso circular: gira solo con transform (no repinta). */
function Spinner() {
  return (
    <motion.span
      aria-hidden="true"
      className="block h-[18px] w-[18px] rounded-full border-2 border-current border-t-transparent opacity-90"
      animate={{ rotate: 360 }}
      transition={{ repeat: Infinity, duration: 0.7, ease: "linear" }}
    />
  );
}

/** Palomita que se dibuja sola al confirmar. */
function CheckMark() {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none">
      <motion.path
        d="M4 10.5L8 14.5L16 6"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      />
    </svg>
  );
}
