"use client";

import { useState, useEffect, useRef, useCallback } from "react";

const fmt = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

type EmployeeResult = {
  employee_id: string;
  nombre: string | null;
  apellidos: string | null;
  rfc: string | null;
  telefono_normalizado: string | null;
  empleador: string | null;
  monto_prestamo_autorizado: number | null;
};

type Props = {
  /** Empleado actualmente seleccionado (si lo hay) */
  selected: EmployeeResult | null;
  onSelect: (emp: EmployeeResult) => void;
  onClear: () => void;
};

function useDebounce<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export function EmployeeSearchBar({ selected, onSelect, onClear }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<EmployeeResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debouncedQuery = useDebounce(query, 300);
  const containerRef = useRef<HTMLDivElement>(null);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/whatsapp/employees/search?q=${encodeURIComponent(q)}&limit=8`,
      );
      const json = await res.json();
      if (json.ok) {
        setResults(json.employees ?? []);
        setOpen(true);
      }
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Keep search in a ref so the debounce effect below can invoke it without
  // closing over it directly.  If the effect callback held a direct reference
  // to `search` the compiler would tag the callback as setState-containing
  // (because search closes over setResults / setOpen / setLoading) and flag
  // the react-hooks/set-state-in-effect rule.
  const searchRef = useRef(search);
  useEffect(() => {
    searchRef.current = search;
  });

  useEffect(() => {
    void searchRef.current(debouncedQuery);
  }, [debouncedQuery]);

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleSelect(emp: EmployeeResult) {
    onSelect(emp);
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  // Si ya hay un empleado seleccionado, mostrar la tarjeta de confirmación
  if (selected) {
    const fullName = [selected.nombre, selected.apellidos].filter(Boolean).join(" ") || "—";
    return (
      <div className="flex items-center justify-between gap-4 rounded-xl border border-[var(--success-border)] px-4 py-3">
        <div className="flex items-center gap-3">
          {/* Avatar inicial */}
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-muted text-sm font-bold text-success">
            {(selected.nombre?.[0] ?? selected.apellidos?.[0] ?? "?").toUpperCase()}
          </span>
          <div>
            <p className="text-sm font-bold text-text-primary">{fullName}</p>
            <p className="mt-0.5 text-xs text-text-muted">
              {selected.rfc && <span className="font-mono">{selected.rfc}</span>}
              {selected.rfc && selected.telefono_normalizado && " · "}
              {selected.telefono_normalizado && (
                <span className="font-mono">{selected.telefono_normalizado}</span>
              )}
              {selected.monto_prestamo_autorizado && (
                <span className="ml-1 font-semibold text-success">
                  · {fmt.format(selected.monto_prestamo_autorizado)}
                </span>
              )}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-text-muted transition hover:bg-[var(--danger-bg)] hover:text-danger"
          title="Quitar selección"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Input */}
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
          {loading ? (
            <svg className="h-4 w-4 animate-spin text-primary" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="h-4 w-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
          )}
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Buscar por nombre, RFC o teléfono..."
          className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm text-text-primary placeholder:text-text-disabled focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          autoComplete="off"
        />
        {query && (
          <button
            type="button"
            onClick={() => { setQuery(""); setResults([]); setOpen(false); }}
            className="absolute inset-y-0 right-2 flex items-center px-1 text-text-muted hover:text-text-primary"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Dropdown de resultados */}
      {open && results.length > 0 && (
        <ul className="absolute z-40 mt-1 w-full overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
          {results.map((emp) => {
            const fullName =
              [emp.nombre, emp.apellidos].filter(Boolean).join(" ") || "Sin nombre";
            return (
              <li key={emp.employee_id}>
                <button
                  type="button"
                  onClick={() => handleSelect(emp)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-primary/5"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-muted text-xs font-bold text-text-muted">
                    {(emp.nombre?.[0] ?? emp.apellidos?.[0] ?? "?").toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-text-primary">{fullName}</p>
                    <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-text-muted">
                      {emp.rfc && <span className="font-mono">{emp.rfc}</span>}
                      {emp.telefono_normalizado && (
                        <span className="font-mono">{emp.telefono_normalizado}</span>
                      )}
                      {emp.empleador && <span>{emp.empleador}</span>}
                    </p>
                  </div>
                  {emp.monto_prestamo_autorizado != null && (
                    <span className="shrink-0 text-xs font-bold text-success">
                      {fmt.format(emp.monto_prestamo_autorizado)}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Estado vacío tras búsqueda */}
      {open && !loading && query.length >= 2 && results.length === 0 && (
        <div className="absolute z-40 mt-1 w-full rounded-xl border border-border bg-surface px-4 py-3 shadow-lg">
          <p className="text-sm text-text-muted">
            No se encontró ningún empleado con &ldquo;{query}&rdquo;.
          </p>
        </div>
      )}
    </div>
  );
}
