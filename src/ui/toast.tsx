"use client";

import { motion, AnimatePresence } from "motion/react";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { toastVariants } from "./motion";

/**
 * Avisos del sistema.
 *
 * Sirven para dos cosas: confirmar que algo pasó, y ofrecer DESHACER. Una
 * acción reversible se ejecuta de inmediato y aparece aquí con "Deshacer",
 * en vez de frenar al operador con un diálogo de confirmación.
 */

type ToastTone = "done" | "failed" | "info";

type Toast = {
  id: number;
  tone: ToastTone;
  message: string;
  /** Si viene, se muestra el botón Deshacer. */
  undo?: () => void;
};

type ToastApi = {
  /** Confirma algo que salió bien. */
  done: (message: string, undo?: () => void) => void;
  /** Reporta un problema: qué pasó y qué hacer. */
  failed: (message: string) => void;
  info: (message: string) => void;
};

const Ctx = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast debe usarse dentro de <ToastProvider>.");
  return ctx;
}

let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);

  const remove = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (tone: ToastTone, message: string, undo?: () => void) => {
      const id = ++seq;
      setItems((prev) => [...prev, { id, tone, message, undo }]);
      // Los avisos con "Deshacer" duran más: hay que alcanzar a reaccionar.
      const ttl = undo ? 9000 : tone === "failed" ? 8000 : 4500;
      setTimeout(() => remove(id), ttl);
    },
    [remove],
  );

  const api = useMemo<ToastApi>(
    () => ({
      done: (m, undo) => push("done", m, undo),
      failed: (m) => push("failed", m),
      info: (m) => push("info", m),
    }),
    [push],
  );

  return (
    <Ctx.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-5 z-[90] flex flex-col items-center gap-3 px-5"
      >
        <AnimatePresence initial={false}>
          {items.map((t) => (
            <motion.div
              key={t.id}
              layout
              variants={toastVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className={
                "pointer-events-auto flex w-full max-w-xl items-center gap-4 rounded-lg border-2 px-5 py-4 shadow-3 " +
                (t.tone === "done"
                  ? "border-done-line bg-done-soft text-done"
                  : t.tone === "failed"
                    ? "border-failed-line bg-failed-soft text-failed"
                    : "border-action-line bg-action-soft text-action")
              }
            >
              <span aria-hidden="true" className="text-[20px]">
                {t.tone === "done" ? "✓" : t.tone === "failed" ? "!" : "i"}
              </span>
              <p className="min-w-0 flex-1 text-[17px] font-semibold">{t.message}</p>
              {t.undo ? (
                <button
                  type="button"
                  onClick={() => {
                    t.undo?.();
                    remove(t.id);
                  }}
                  className="shrink-0 rounded-md border-2 border-current px-4 py-2 text-[15px] font-bold hover:opacity-80"
                >
                  Deshacer
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => remove(t.id)}
                aria-label="Cerrar aviso"
                className="shrink-0 rounded-full p-1.5 opacity-70 hover:opacity-100"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}
