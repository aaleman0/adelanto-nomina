"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmployeeSearchBar } from "./employee-search-bar";
import type { SendMode, RecentImport } from "./types";

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
  mode: SendMode;
  selectedImportId: string;
  manualIds: string[];
  onModeChange: (mode: SendMode) => void;
  onImportChange: (importId: string) => void;
  onManualIdsChange: (ids: string[]) => void;
  onNext: () => void;
};

function formatImportDate(value: string | null): string {
  if (!value) return "sin fecha";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "sin fecha";
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function RecipientStep({
  mode,
  selectedImportId,
  manualIds,
  onModeChange,
  onImportChange,
  onManualIdsChange,
  onNext,
}: Props) {
  const [imports, setImports] = useState<RecentImport[]>([]);
  const [loadingImports, setLoadingImports] = useState(true);
  const [importsError, setImportsError] = useState<string | null>(null);
  const [testEmployee, setTestEmployee] = useState<EmployeeResult | null>(null);
  const [importQuery, setImportQuery] = useState("");

  useEffect(() => {
    fetch("/api/whatsapp/imports")
      .then((r) => r.json())
      .then((json) => {
        if (json.ok) setImports(json.imports ?? []);
        else setImportsError(json.error ?? "Error al cargar importaciones.");
      })
      .catch(() => setImportsError("No se pudieron cargar las importaciones."))
      .finally(() => setLoadingImports(false));
  }, []);

  const canContinue = mode === "import" ? !!selectedImportId : manualIds.length > 0;
  const selectedImport = imports.find((i) => i.id === selectedImportId);

  // El buscador solo aparece cuando hay suficientes para que valga la pena.
  const showImportSearch = imports.length > 4;
  const filteredImports = importQuery.trim()
    ? imports.filter((imp) =>
        (imp.filename ?? "").toLowerCase().includes(importQuery.trim().toLowerCase()),
      )
    : imports;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <ModeButton active={mode === "import"} label="Importación" onClick={() => onModeChange("import")} />
        <ModeButton active={mode === "manual"} label="Manual" onClick={() => onModeChange("manual")} />
      </div>

      {mode === "import" && (
        <Card className="p-4">
          <h3 className="text-sm font-medium text-text-muted">Selecciona una importación</h3>
          {loadingImports && <div className="mt-3 space-y-2"><div className="h-12 animate-pulse rounded-lg bg-surface-muted" /><div className="h-12 animate-pulse rounded-lg bg-surface-muted" /></div>}
          {importsError && <p className="mt-3 text-sm text-red-600">{importsError}</p>}
          {!loadingImports && !importsError && imports.length === 0 && (
            <p className="mt-3 text-sm text-text-muted">No hay importaciones aplicadas. <a href="/imports" className="text-primary underline">Ir a Importaciones</a></p>
          )}
          {!loadingImports && imports.length > 0 && (
            <>
              {showImportSearch && (
                <input
                  type="search"
                  value={importQuery}
                  onChange={(e) => setImportQuery(e.target.value)}
                  placeholder="Filtrar por nombre de archivo…"
                  className="mt-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary outline-none focus:border-primary"
                />
              )}
              <div className="mt-3 flex flex-col gap-2">
                {filteredImports.map((imp, index) => {
                  // "Más reciente" solo en la primera del listado completo (viene
                  // ordenado por fecha desc) y sin filtro activo, para guiar el
                  // caso común sin mentir cuando se está buscando.
                  const esMasReciente = index === 0 && imp.id === imports[0]?.id && !importQuery.trim();
                  const seleccionada = selectedImportId === imp.id;
                  return (
                    <button
                      key={imp.id}
                      type="button"
                      onClick={() => onImportChange(imp.id)}
                      aria-pressed={seleccionada}
                      className={["flex w-full items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left transition", seleccionada ? "border-primary bg-primary-light ring-1 ring-primary" : "border-border bg-surface hover:bg-surface-muted"].join(" ")}
                    >
                      <span className="min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-text-primary">{imp.filename ?? "Importación sin nombre"}</span>
                          {esMasReciente && <span className="shrink-0 rounded-full bg-primary-light px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">Más reciente</span>}
                        </span>
                        <span className="mt-0.5 block text-xs text-text-muted">{formatImportDate(imp.applied_at)}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2 text-xs text-text-muted">
                        {imp.total_rows ?? 0} empleados
                        {seleccionada && <span className="text-primary" aria-hidden>✓</span>}
                      </span>
                    </button>
                  );
                })}
                {filteredImports.length === 0 && (
                  <p className="py-2 text-sm text-text-muted">Ninguna importación coincide con «{importQuery}».</p>
                )}
              </div>
            </>
          )}
          {selectedImport && (
            <p className="mt-3 text-sm text-primary">
              Importación seleccionada: <span className="text-text-primary">{selectedImport.filename}</span>
            </p>
          )}
        </Card>
      )}

      {mode === "manual" && (
        <Card className="p-4">
          <h3 className="text-sm font-medium text-text-muted">IDs de empleados</h3>
          <textarea
            className="mt-3 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-mono text-text-primary outline-none focus:border-primary"
            rows={6}
            placeholder="uuid-empleado-1, uuid-empleado-2"
            defaultValue={manualIds.join(", ")}
            onChange={(e) => {
              const ids = e.target.value.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
              onManualIdsChange(ids);
            }}
          />
          {manualIds.length > 0 && <p className="mt-2 text-xs text-text-muted">{manualIds.length} ID{manualIds.length !== 1 ? "s" : ""} ingresado{manualIds.length !== 1 ? "s" : ""}</p>}

          <div className="mt-4 border-t border-border pt-4">
            <p className="text-sm font-medium text-text-primary">Envío de prueba</p>
            <EmployeeSearchBar
              selected={testEmployee}
              onSelect={(emp) => {
                setTestEmployee(emp);
                onModeChange("manual");
                onManualIdsChange([emp.employee_id]);
              }}
              onClear={() => {
                setTestEmployee(null);
                onManualIdsChange([]);
              }}
            />
          </div>
        </Card>
      )}

      <div className="flex justify-end">
        <Button disabled={!canContinue} onClick={onNext}>Siguiente</Button>
      </div>
    </div>
  );
}

function ModeButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={["rounded-xl border px-4 py-3 text-left text-sm font-medium", active ? "border-primary bg-primary-light text-primary" : "border-border bg-surface text-text-primary hover:bg-surface-muted"].join(" ")}
    >
      {label}
    </button>
  );
}
