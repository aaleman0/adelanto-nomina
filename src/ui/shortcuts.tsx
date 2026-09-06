"use client";

import { useEffect } from "react";

/**
 * Atajos de teclado.
 *
 * Regla del sistema: si un atajo existe, se VE en pantalla junto al control
 * que dispara. Un atajo escondido en un manual no existe para el operador.
 * Por eso `<Key>` se usa dentro de los propios botones y campos.
 */

/**
 * Registra un atajo global. Se ignora mientras el foco está en un campo de
 * texto (salvo que sea Escape), para no robar teclas mientras se escribe.
 */
export function useShortcut(
  key: string,
  handler: () => void,
  options: { enabled?: boolean } = {},
) {
  const { enabled = true } = options;

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;

      if (typing && e.key !== "Escape") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() !== key.toLowerCase()) return;

      e.preventDefault();
      handler();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [key, handler, enabled]);
}

/** Tecla dibujada. Se coloca junto a la acción que dispara, nunca aparte. */
export function Key({ children, tone = "light" }: { children: string; tone?: "light" | "dark" }) {
  return (
    <kbd
      className={
        "ml-1 inline-flex h-6 min-w-6 items-center justify-center rounded border px-1.5 font-mono text-[13px] font-bold " +
        (tone === "dark"
          ? "border-white/30 bg-white/15 text-white"
          : "border-line-strong bg-paper text-ink-2")
      }
    >
      {children}
    </kbd>
  );
}

/** Pie de página con los atajos disponibles en la vista actual. */
export function ShortcutBar({ items }: { items: Array<{ key: string; label: string }> }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md bg-paper-deep px-5 py-3 text-[15px] text-ink-2">
      <span className="font-bold text-ink">Atajos</span>
      {items.map((i) => (
        <span key={i.key} className="inline-flex items-center gap-1.5">
          <Key>{i.key}</Key>
          {i.label}
        </span>
      ))}
    </div>
  );
}
