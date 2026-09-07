"use client";

import { motion, AnimatePresence } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { SPRING, T, staggerChild, staggerParent, errorVariants, successVariants } from "./motion";
import { Button } from "./button";

/**
 * Estados obligatorios de toda vista: vacío, cargando, error, éxito y sin
 * conexión. Ninguna pantalla puede quedar en blanco.
 *
 * Regla de redacción: los mensajes dicen QUÉ PASÓ y QUÉ HACER AHORA, en
 * lenguaje de operador. Nunca códigos, stack traces ni jerga técnica.
 */

/** Vacío: no es un error, es una invitación a la acción que sigue. */
export function Empty({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING.soft}
      className="flex flex-col items-center justify-center gap-4 rounded-lg bg-surface px-8 py-16 text-center shadow-1"
    >
      <motion.div
        aria-hidden="true"
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ ...SPRING.soft, delay: 0.06 }}
        className="flex h-16 w-16 items-center justify-center rounded-full bg-paper-deep"
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-ink-3">
          <path d="M5 7h14M5 12h14M5 17h7" strokeLinecap="round" />
        </svg>
      </motion.div>
      <h3 className="text-[23px] font-bold text-ink">{title}</h3>
      {hint ? <p className="max-w-md text-[17px] leading-relaxed text-ink-2">{hint}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </motion.div>
  );
}

/**
 * Error de una vista. `detail` es el mensaje humano; el detalle técnico se
 * guarda en consola, no se le enseña al operador.
 */
export function ErrorState({
  title = "No se pudo cargar esta información",
  hint = "Es un problema temporal. Vuelve a intentarlo; si sigue igual, avisa a soporte.",
  onRetry,
  retryLabel = "Volver a intentar",
}: {
  title?: string;
  hint?: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <motion.div
      variants={errorVariants}
      initial="initial"
      animate="animate"
      role="alert"
      className="flex flex-col items-center justify-center gap-4 rounded-lg border-2 border-failed-line bg-surface px-8 py-14 text-center shadow-1"
    >
      <div aria-hidden="true" className="flex h-16 w-16 items-center justify-center rounded-full bg-failed-soft">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="text-failed">
          <path d="M12 8v5M12 16.5v.5" strokeLinecap="round" />
          <circle cx="12" cy="12" r="9" />
        </svg>
      </div>
      <h3 className="text-[23px] font-bold text-ink">{title}</h3>
      <p className="max-w-md text-[17px] leading-relaxed text-ink-2">{hint}</p>
      {onRetry ? (
        <Button variant="primary" size="lg" onClick={onRetry} className="mt-2">
          {retryLabel}
        </Button>
      ) : null}
    </motion.div>
  );
}

/** Esqueleto de carga: refleja la forma real del contenido que viene. */
export function LoadingRows({ rows = 4, className = "" }: { rows?: number; className?: string }) {
  return (
    <motion.div
      variants={staggerParent}
      initial="initial"
      animate="animate"
      aria-busy="true"
      aria-label="Cargando"
      className={`flex flex-col gap-3 ${className}`}
    >
      {Array.from({ length: rows }).map((_, i) => (
        <motion.div key={i} variants={staggerChild} className="flex items-center gap-4 rounded-lg bg-surface p-5 shadow-1">
          <div className="skeleton h-12 w-12 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-4 w-1/3" />
            <div className="skeleton h-3.5 w-1/2" />
          </div>
          <div className="skeleton h-9 w-28 rounded-full" />
        </motion.div>
      ))}
    </motion.div>
  );
}

/** Esqueleto para bloques grandes (tarjetas de resumen). */
export function LoadingTiles({ tiles = 4 }: { tiles?: number }) {
  return (
    <motion.div
      variants={staggerParent}
      initial="initial"
      animate="animate"
      aria-busy="true"
      aria-label="Cargando"
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      {Array.from({ length: tiles }).map((_, i) => (
        <motion.div key={i} variants={staggerChild} className="rounded-lg bg-surface p-5 shadow-1">
          <div className="skeleton h-11 w-20" />
          <div className="skeleton mt-3 h-4 w-28" />
        </motion.div>
      ))}
    </motion.div>
  );
}

/** Confirmación de éxito en línea (no un modal que estorbe). */
export function SuccessNote({ children }: { children: ReactNode }) {
  return (
    <motion.div
      variants={successVariants}
      initial="initial"
      animate="animate"
      role="status"
      className="flex items-center gap-3 rounded-md border border-done-line bg-done-soft px-5 py-4 text-[17px] font-semibold text-done"
    >
      <svg aria-hidden="true" width="22" height="22" viewBox="0 0 22 22" fill="none">
        <motion.path
          d="M5 11.5L9 15.5L17 6.5"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      {children}
    </motion.div>
  );
}

/** Aviso de problema en línea, con qué hacer. */
export function ProblemNote({ children }: { children: ReactNode }) {
  return (
    <motion.div
      variants={errorVariants}
      initial="initial"
      animate="animate"
      role="alert"
      className="flex items-start gap-3 rounded-md border border-failed-line bg-failed-soft px-5 py-4 text-[17px] text-failed"
    >
      <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="mt-0.5 shrink-0">
        <path d="M12 8v5M12 16.5v.5" strokeLinecap="round" />
        <circle cx="12" cy="12" r="9" />
      </svg>
      <span className="font-medium">{children}</span>
    </motion.div>
  );
}

/**
 * Sin conexión: barra fija arriba. Aparece deslizando y se va sola al
 * recuperar la red, para que el operador sepa por qué no le responde el
 * sistema en vez de creer que "se trabó".
 */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return (
    <AnimatePresence>
      {offline ? (
        <motion.div
          initial={{ y: -60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -60, opacity: 0 }}
          transition={SPRING.soft}
          role="alert"
          className="fixed inset-x-0 top-0 z-[80] flex items-center justify-center gap-3 bg-attention-fill px-5 py-3 text-[17px] font-bold text-[#3d2600] shadow-2"
        >
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-[#3d2600]" />
          Sin internet. Lo que hagas ahora no se va a guardar hasta que vuelva la conexión.
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/** Transición suave entre cargando → contenido → vacío/error, sin parpadeos. */
export function AsyncSwitch({
  state,
  loading,
  empty,
  error,
  children,
}: {
  state: "loading" | "empty" | "error" | "ready";
  loading: ReactNode;
  empty: ReactNode;
  error: ReactNode;
  children: ReactNode;
}) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={state}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={T.base}
      >
        {state === "loading" ? loading : state === "empty" ? empty : state === "error" ? error : children}
      </motion.div>
    </AnimatePresence>
  );
}
