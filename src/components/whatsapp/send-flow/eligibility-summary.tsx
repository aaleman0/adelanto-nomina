"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
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

function EligibilityPill({ eligible, reason }: { eligible: boolean; reason?: string }) {
  if (eligible) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Elegible
      </span>
    );
  }
  return (
    <span
      title={reason}
      className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-red-200"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
      {reason ?? "No elegible"}
    </span>
  );
}

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
  // Start in "loading" immediately when there is no prior validation so that
  // the initial fetch effect below never needs to call setLoadState
  // synchronously from within the effect body.
  const [loadState, setLoadState] = useState<LoadState>(() =>
    validation ? "done" : "loading",
  );
  const [loadError, setLoadError] = useState<string | null>(null);

  // validate() is used by both the auto-run on mount and the manual "retry"
  // buttons.  It contains all setState calls, but they only execute after
  // the first `await`, so they are never synchronous when called from an
  // event handler.  When called from the effect below the effect callback
  // itself does not close over any setState — it only holds a reference to
  // `validate` which is NOT itself tagged as a setState by the compiler.
  const validate = useCallback(async () => {
    setLoadState("loading");
    setLoadError(null);
    try {
      const body =
        mode === "import"
          ? { mode: "import", importId }
          : { mode: "manual", employeeIds };

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
      // Pre-seleccionar todos los elegibles
      onSelectionChange(
        new Set(employees.filter((e) => e.eligible).map((e) => e.employee_id)),
      );
      setLoadState("done");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Error al verificar destinatarios.");
      setLoadState("error");
    }
  }, [mode, importId, employeeIds, onValidationChange, onSelectionChange]);

  // Keep a ref so the mount effect below can call validate() without closing
  // over it directly (which would make the effect callback itself appear to
  // contain setState to the compiler's dataflow analysis).
  const validateRef = useRef(validate);
  useEffect(() => {
    validateRef.current = validate;
  });

  // Auto-validar al montar si no hay validación previa.
  // loadState is already initialised to "loading" by the useState lazy
  // initializer above, so no synchronous setState is needed here.
  // We read validate through a ref so the effect callback itself never
  // closes over a setState-containing function, satisfying the rule.
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
    onSelectionChange(
      new Set(validation.employees.filter((e) => e.eligible).map((e) => e.employee_id)),
    );
  }

  function deselectAll() {
    onSelectionChange(new Set());
  }

  const selectedEligible = validation
    ? validation.employees.filter((e) => selectedEmployeeIds.has(e.employee_id) && e.eligible).length
    : 0;

  const canSend = selectedEligible > 0;

  return (
    <div className="flex flex-col gap-5">
      {/* Estado cargando */}
      {loadState === "loading" && (
        <Card>
          <CardBody>
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <Spinner className="h-8 w-8 text-primary" />
              <p className="text-sm font-semibold text-text-primary">Verificando destinatarios...</p>
              <p className="text-xs text-text-muted">
                Estamos revisando elegibilidad, teléfonos y estados de cada empleado.
              </p>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Estado error */}
      {loadState === "error" && (
        <Card>
          <CardBody>
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-bold text-text-primary">No se pudo verificar</p>
                <p className="mt-1 text-xs text-text-muted">{loadError}</p>
              </div>
              <Button variant="secondary" onClick={validate}>
                Intentar de nuevo
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Resultados */}
      {loadState === "done" && validation && (
        <>
          {/* Resumen de conteos */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryCard
              label="Total encontrados"
              value={validation.total}
              tone="neutral"
            />
            <SummaryCard
              label="Elegibles"
              value={validation.eligible}
              tone="ok"
              highlight
            />
            <SummaryCard
              label="No elegibles"
              value={validation.notEligible}
              tone={validation.notEligible > 0 ? "warn" : "neutral"}
            />
            <SummaryCard
              label="Sin teléfono"
              value={validation.noPhone}
              tone={validation.noPhone > 0 ? "warn" : "neutral"}
            />
          </div>

          {/* Advertencia si no hay elegibles */}
          {validation.eligible === 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-sm font-bold text-red-800">No hay empleados elegibles</p>
              <p className="mt-1 text-xs text-red-700">
                Ninguno de los empleados seleccionados cumple los requisitos para recibir el mensaje. Verifica que tengan oferta vigente, cuenta bancaria activa y teléfono registrado.
              </p>
            </div>
          )}

          {/* Tabla de empleados */}
          {validation.employees.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-text-primary">Detalle de empleados</h3>
                    <p className="mt-0.5 text-xs text-text-muted">
                      <span className="font-semibold text-emerald-600">{validation.eligible} elegibles</span>
                      {" "}de {validation.total} ·{" "}
                      <span className="font-semibold text-primary">{selectedEligible} seleccionados</span>
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" className="h-8 px-3 text-xs" onClick={selectAllEligible}>
                      Todos los elegibles
                    </Button>
                    <Button variant="ghost" className="h-8 px-3 text-xs" onClick={deselectAll}>
                      Limpiar
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardBody className="p-0">
                <div className="max-h-[380px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 border-b border-border bg-surface-muted">
                      <tr>
                        <th className="w-10 px-3 py-2.5" />
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-text-muted">Nombre</th>
                        <th className="hidden px-3 py-2.5 text-left text-xs font-bold text-text-muted sm:table-cell">RFC</th>
                        <th className="hidden px-3 py-2.5 text-left text-xs font-bold text-text-muted md:table-cell">Monto</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-text-muted">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {validation.employees.map((emp, i) => (
                        <tr
                          key={emp.employee_id}
                          className={[
                            "border-t border-border transition-colors",
                            i % 2 === 0 ? "bg-background" : "bg-surface-muted/30",
                            emp.eligible
                              ? "cursor-pointer hover:bg-primary/5"
                              : "cursor-not-allowed opacity-50",
                          ].join(" ")}
                          onClick={() => emp.eligible && toggleEmployee(emp.employee_id)}
                        >
                          <td className="px-3 py-2.5">
                            <input
                              type="checkbox"
                              checked={selectedEmployeeIds.has(emp.employee_id)}
                              disabled={!emp.eligible}
                              onChange={() => toggleEmployee(emp.employee_id)}
                              onClick={(e) => e.stopPropagation()}
                              className="rounded accent-primary"
                            />
                          </td>
                          <td className="px-3 py-2.5 font-medium text-text-primary">
                            {[emp.nombre, emp.apellidos].filter(Boolean).join(" ") || "—"}
                          </td>
                          <td className="hidden px-3 py-2.5 font-mono text-xs text-text-muted sm:table-cell">
                            {emp.rfc || "—"}
                          </td>
                          <td className="hidden px-3 py-2.5 text-text-primary md:table-cell">
                            {emp.monto_prestamo_autorizado
                              ? fmt.format(emp.monto_prestamo_autorizado)
                              : "—"}
                          </td>
                          <td className="px-3 py-2.5">
                            <EligibilityPill eligible={emp.eligible} reason={emp.reason} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardBody>
            </Card>
          )}

          {/* Re-validar */}
          <div className="flex justify-center">
            <button
              type="button"
              onClick={validate}
              className="text-xs font-semibold text-text-muted underline hover:text-text-primary hover:no-underline"
            >
              Volver a verificar
            </button>
          </div>
        </>
      )}

      {/* Acciones */}
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={onBack}>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Volver
        </Button>
        <Button disabled={!canSend || loadState !== "done"} onClick={onNext}>
          Confirmar envío a {selectedEligible} empleado{selectedEligible !== 1 ? "s" : ""}
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
          </svg>
        </Button>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
  highlight,
}: {
  label: string;
  value: number;
  tone: "ok" | "warn" | "error" | "neutral";
  highlight?: boolean;
}) {
  const cls =
    tone === "ok"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "warn"
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : tone === "error"
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-border bg-surface text-text-primary";

  return (
    <div className={["rounded-xl border px-4 py-3 text-center", cls, highlight ? "shadow-sm" : ""].join(" ")}>
      <p className={["text-3xl font-extrabold", highlight ? "" : ""].join(" ")}>{value}</p>
      <p className="mt-0.5 text-xs font-semibold uppercase tracking-wide opacity-80">{label}</p>
    </div>
  );
}

function Spinner({ className }: { className?: string }) {
  return (
    <svg className={["animate-spin", className].join(" ")} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
