"use client";

import { motion, AnimatePresence } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";
import { scrimVariants, modalVariants, drawerVariants } from "./motion";
import { Button } from "./button";

/**
 * Capas por encima de la página.
 *
 * Regla del sistema: SOLO se confirma lo destructivo o lo que cuesta dinero
 * (una firma de EasyLex, un envío masivo). Lo reversible se hace directo y se
 * ofrece deshacer; pedir confirmación de todo entrena al operador a decir que
 * sí sin leer.
 */

/** Cierra con Escape y bloquea el scroll del fondo mientras está abierto. */
function useDismiss(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = "max-w-xl",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  useDismiss(open, onClose);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-5">
          <motion.div
            variants={scrimVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            onClick={onClose}
            className="absolute inset-0 bg-[rgba(14,20,32,0.55)] backdrop-blur-[2px]"
          />
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            variants={modalVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className={`relative w-full ${width} rounded-xl bg-surface p-7 shadow-3 outline-none`}
          >
            <h2 className="pr-10 text-[27px] font-bold leading-tight text-ink">{title}</h2>
            {description ? <p className="mt-2 text-[17px] leading-relaxed text-ink-2">{description}</p> : null}
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="absolute right-5 top-5 flex h-11 w-11 items-center justify-center rounded-full text-ink-2 hover:bg-paper-deep"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            </button>
            {children ? <div className="mt-6">{children}</div> : null}
            {footer ? <div className="mt-8 flex flex-wrap justify-end gap-3">{footer}</div> : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}

/**
 * Confirmación de una acción destructiva o costosa.
 * `consequence` dice en una frase qué va a pasar exactamente, sin rodeos.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  consequence,
  confirmLabel,
  loading = false,
  tone = "danger",
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  consequence: string;
  confirmLabel: string;
  loading?: boolean;
  tone?: "danger" | "primary";
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={consequence}
      width="max-w-lg"
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button variant={tone} size="lg" onClick={onConfirm} loading={loading} loadingLabel="Procesando…">
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}

/** Panel lateral para el detalle de un elemento, sin perder la lista de atrás. */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useDismiss(open, onClose);

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[70]">
          <motion.div
            variants={scrimVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            onClick={onClose}
            className="absolute inset-0 bg-[rgba(14,20,32,0.5)]"
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={title}
            variants={drawerVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="absolute right-0 top-0 flex h-full w-full max-w-2xl flex-col bg-paper shadow-3"
          >
            <header className="flex shrink-0 items-start justify-between gap-4 border-b border-line bg-surface px-7 py-5">
              <div className="min-w-0">
                <h2 className="truncate text-[27px] font-bold leading-tight text-ink">{title}</h2>
                {subtitle ? <p className="mt-1 truncate text-[17px] text-ink-3">{subtitle}</p> : null}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-11 shrink-0 items-center gap-2 rounded-md px-3 text-[15px] font-semibold text-ink-2 hover:bg-paper-deep"
              >
                <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
                Cerrar
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-7 py-6">{children}</div>
            {footer ? (
              <footer className="shrink-0 border-t border-line bg-surface px-7 py-5">{footer}</footer>
            ) : null}
          </motion.aside>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
