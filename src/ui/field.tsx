"use client";

import { motion, AnimatePresence } from "motion/react";
import { useId, useRef, useState, type ReactNode, type InputHTMLAttributes } from "react";
import { SPRING, T, popVariants } from "./motion";

/**
 * Controles de entrada.
 *
 * · La etiqueta SIEMPRE está visible arriba del campo (nunca solo placeholder:
 *   el operador no debe recordar qué iba en un campo ya escrito).
 * · Alto 56px y texto de 17px: se acierta sin precisión y se lee a distancia.
 * · El foco pinta un anillo azul grueso; el error pinta el borde y explica
 *   debajo qué corregir.
 */

const fieldBase =
  "w-full rounded-md border-2 bg-surface px-4 text-[17px] text-ink placeholder:text-ink-3/70 " +
  "outline-none transition-[border-color,box-shadow] duration-[160ms] " +
  "focus:border-action focus:shadow-[0_0_0_4px_var(--action-soft)] disabled:opacity-55";

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
  required,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
  htmlFor?: string;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={htmlFor} className="text-[15px] font-bold text-ink">
        {label}
        {required ? <span className="ml-1 text-failed">*</span> : null}
      </label>
      {hint ? <p className="-mt-1 text-[15px] leading-snug text-ink-3">{hint}</p> : null}
      {children}
      <AnimatePresence>
        {error ? (
          <motion.p
            initial={{ opacity: 0, y: -4, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={T.fast}
            role="alert"
            className="text-[15px] font-semibold text-failed"
          >
            {error}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export function TextInput({
  label,
  hint,
  error,
  required,
  className = "",
  ...rest
}: {
  label: string;
  hint?: string;
  error?: string | null;
} & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id} required={required}>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        className={`${fieldBase} h-14 ${error ? "border-failed" : "border-line-strong"} ${className}`}
        {...rest}
      />
    </Field>
  );
}

export function SelectInput({
  label,
  hint,
  error,
  required,
  children,
  className = "",
  ...rest
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
} & InputHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id} required={required}>
      <div className="relative">
        <select
          id={id}
          aria-invalid={error ? true : undefined}
          className={`${fieldBase} h-14 appearance-none pr-12 ${error ? "border-failed" : "border-line-strong"} ${className}`}
          {...(rest as React.SelectHTMLAttributes<HTMLSelectElement>)}
        >
          {children}
        </select>
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-ink-2"
          width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2"
        >
          <path d="M5 8l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </Field>
  );
}

/** Búsqueda con icono, limpiado rápido y atajo visible. */
export function SearchInput({
  value,
  onChange,
  placeholder = "Buscar por nombre o RFC",
  shortcut,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** Tecla que enfoca este campo, mostrada dentro del control. */
  shortcut?: string;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);

  return (
    <div className="relative">
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-3"
        width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
      </svg>
      <input
        ref={ref}
        type="search"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={`${fieldBase} h-14 border-line-strong pl-12 ${shortcut ? "pr-16" : "pr-12"}`}
      />
      <AnimatePresence>
        {value ? (
          <motion.button
            type="button"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={SPRING.snappy}
            onClick={() => { onChange(""); ref.current?.focus(); }}
            aria-label="Borrar búsqueda"
            className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-ink-2 hover:bg-paper-deep"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
            </svg>
          </motion.button>
        ) : shortcut && !focused ? (
          <motion.span
            variants={popVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            aria-hidden="true"
            className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 rounded border border-line-strong bg-paper px-2 py-1 font-mono text-[13px] font-semibold text-ink-2"
          >
            {shortcut}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** Casilla grande: el área de clic incluye la etiqueta completa. */
export function CheckField({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <motion.label
      whileTap={disabled ? undefined : { scale: 0.99 }}
      transition={SPRING.snappy}
      className={`flex cursor-pointer items-start gap-4 rounded-md border-2 p-4 transition-colors duration-[160ms] ${
        checked ? "border-action bg-action-soft" : "border-line bg-surface hover:bg-surface-hover"
      } ${disabled ? "cursor-not-allowed opacity-55" : ""}`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />
      <span
        aria-hidden="true"
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] border-2 transition-colors duration-[160ms] ${
          checked ? "border-action bg-action text-white" : "border-line-strong bg-surface"
        }`}
      >
        <AnimatePresence>
          {checked ? (
            <motion.svg
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={SPRING.snappy}
              width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="3"
            >
              <path d="M4 10.5l4 4 8-9" strokeLinecap="round" strokeLinejoin="round" />
            </motion.svg>
          ) : null}
        </AnimatePresence>
      </span>
      <span className="min-w-0">
        <span className="block text-[17px] font-semibold text-ink">{label}</span>
        {hint ? <span className="mt-0.5 block text-[15px] text-ink-3">{hint}</span> : null}
      </span>
    </motion.label>
  );
}
