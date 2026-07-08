"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { SendMode, EmployeeRow, ValidationSummary } from "./types";

const fmt = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

type Props = {
  mode: SendMode;
  importId: string;
  employeeIds: string[];
  templateName: string;
  validation: ValidationSummary | null;
  selectedEmployeeIds: Set<string>;
  onValidationChange: (v: ValidationSummary) => void;
  onSelectionChange: (ids: Set<string>) => void;
  onNext: () => void;
  onBack: () => void;
};

type LoadState = "idle" | "loading" | "done" | "error";

export function EligibilitySummary({
  mode,
  importId,
  employeeIds,
  validation,
  selectedEmployeeIds,
  onValidationChange,
  onSelectionChange,
  onNext,
  onBack,
}: Props) {
  const [loadState, setLoadState] = useState<LoadState>(() => (validation ? "done" : "loading"));
  const [loadError, setLoadError] = useState<string | null>(null);

  const validate = useCallback(async () => {
    setLoadState("loading");
    setLoadError(null);
    try {
      const body = mode === "import" ? { mode: "import", importId } : { mode: "manual", employeeIds };
      const res = await fetch("/api/whatsapp/bulk?action=validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Error al validar.");

      const employees: EmployeeRow[] = json.employees ?? [];
      const noPhone = employees.filter((e) => !e.telefono_normalizado).length;
      const summary: ValidationSummary = {
        total: json.total,
        eligible: json.eligible,
        notEligible: json.total - json.eligible,
        noPhone,
        employees,
      };

      onValidationChange(summary);
      onSelectionChange(new Set(employees.filter((e) => e.eligible).map((e) => e.employee_id)));
      setLoadState("done");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Error al verificar destinatarios.");
      setLoadState("error");
    }
  }, [mode, importId, employeeIds, onValidationChange, onSelectionChange]);

  const validateRef = useRef(validate);
  useEffect(() => { validateRef.current = validate; });
  useEffect(() => {
    if (validation) return;
    void validateRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleEmployee(id: string) {
    const next = new Set(selectedEmployeeIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  }

  function selectAllEligible() {
    if (!validation) return;
    onSelectionChange(new Set(validation.employees.filter((e) => e.eligible).map((e) => e.employee_id)));
  }

  function deselectAll() {
    onSelectionChange(new Set());
  }

  const selectedEligible = validation
    ? validation.employees.filter((e) => selectedEmployeeIds.has(e.employee_id) && e.eligible).length
    : 0;

  const canSend = selectedEligible > 0;

  return (
    <div className="flex flex-col gap-4">
      {loadState === "loading" && (
        <Card className="p-8 text-center">
          <p className="text-sm font-medium text-text-primary">Verificando destinatarios...</p>
        </Card>
      )}

      {loadState === "error" && (
        <Card className="p-6 text-center">
          <p className="text-sm text-red-600">{loadError}</p>
          <Button variant="secondary" className="mt-3" onClick={validate}>Reintentar</Button>
        </Card>
      )}

      {loadState === "done" && validation && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryCard label="Total" value={validation.total} />
            <SummaryCard label="Elegibles" value={validation.eligible} tone="ok" />
            <SummaryCard label="No elegibles" value={validation.notEligible} tone="warn" />
            <SummaryCard label="Sin teléfono" value={validation.noPhone} tone={validation.noPhone > 0 ? "warn" : "neutral"} />
          </div>

          {validation.eligible === 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              No hay empleados elegibles. Verifica que tengan oferta vigente y teléfono registrado.
            </div>
          )}

          {validation.employees.length > 0 && (
            <Card className="overflow-hidden p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-text-muted">{validation.eligible} elegibles · {selectedEligible} seleccionados</p>
                <div className="flex gap-2">
                  <Button variant="ghost" className="h-8 px-3 text-xs" onClick={selectAllEligible}>Todos</Button>
                  <Button variant="ghost" className="h-8 px-3 text-xs" onClick={deselectAll}>Limpiar</Button>
                </div>
              </div>
              <div className="mt-3 max-h-[320px] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 border-b border-border bg-surface-muted">
                    <tr>
                      <th className="w-10 px-3 py-2" />
                      <th className="px-3 py-2 text-left text-xs font-medium text-text-muted">Nombre</th>
                      <th className="hidden px-3 py-2 text-left text-xs font-medium text-text-muted sm:table-cell">RFC</th>
                      <th className="hidden px-3 py-2 text-left text-xs font-medium text-text-muted md:table-cell">Monto</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-text-muted">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {validation.employees.map((emp) => (
                      <tr
                        key={emp.employee_id}
                        className={["transition hover:bg-surface-muted/50", emp.eligible ? "cursor-pointer" : "opacity-60"].join(" ")}
                        onClick={() => emp.eligible && toggleEmployee(emp.employee_id)}
                      >
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={selectedEmployeeIds.has(emp.employee_id)}
                            disabled={!emp.eligible}
                            onChange={() => toggleEmployee(emp.employee_id)}
                            onClick={(e) => e.stopPropagation()}
                            className="rounded accent-primary"
                          />
                        </td>
                        <td className="px-3 py-2 font-medium text-text-primary">{[emp.nombre, emp.apellidos].filter(Boolean).join(" ") || "—"}</td>
                        <td className="hidden px-3 py-2 font-mono text-xs text-text-muted sm:table-cell">{emp.rfc || "—"}</td>
                        <td className="hidden px-3 py-2 text-text-primary md:table-cell">{emp.monto_prestamo_autorizado ? fmt.format(emp.monto_prestamo_autorizado) : "—"}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${emp.eligible ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
                            {emp.eligible ? "Elegible" : emp.reason || "No elegible"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}

      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={onBack}>Volver</Button>
        <Button disabled={!canSend || loadState !== "done"} onClick={onNext}>
          Confirmar ({selectedEligible})
        </Button>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone?: "ok" | "warn" | "neutral" }) {
  const cls =
    tone === "ok" ? "text-emerald-600" :
    tone === "warn" ? "text-amber-600" :
    "text-text-primary";
  return (
    <div className="rounded-xl border border-border bg-surface p-3 text-center">
      <p className={`text-2xl font-semibold ${cls}`}>{value}</p>
      <p className="text-xs text-text-muted">{label}</p>
    </div>
  );
}
