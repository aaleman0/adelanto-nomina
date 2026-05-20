"use client";

import { useState, useEffect } from "react";

/**
 * Retarda la actualización de un valor por `delay` ms.
 * Útil para evitar demasiadas peticiones al servidor mientras el usuario escribe.
 *
 * @param value El valor a debounce-ar
 * @param delay El tiempo de espera en ms (default: 300)
 * @returns El valor debounced
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
