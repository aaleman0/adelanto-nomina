"use client";

import { useEffect, useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { EmployeeSearchBar } from "./employee-search-bar";
import type { SendMode, RecentImport } from "./types";

const fmtDate = (d: string | null) =>
  d
    ? new Intl.DateTimeFormat("es-MX", { dateStyle: "long" }).format(new Date(d))
    : null;

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
  const [testPanelOpen, setTestPanelOpen] = useState(false);
  const [testEmployee, setTestEmployee] = useState<EmployeeResult | null>(null);

  useEffect(() => {
    setLoadingImports(true);
    fetch("/api/whatsapp/imports")
      .then((r) => r.json())
      .then((json) => {
        if (json.ok) setImports(json.imports ?? []);
        else setImportsError(json.error ?? "Error al cargar importaciones.");
      })
      .catch(() => setImportsError("No se pudieron cargar las importaciones."))
      .finally(() => setLoadingImports(false));
  }, []);

  const canContinue =
    mode === "import" ? !!selectedImportId : manualIds.length > 0;

  const selectedImport = imports.find((i) => i.id === selectedImportId);

  return (
    <div className="flex flex-col gap-5">
      {/* Selector de modo */}
      <div className="grid gap-3 sm:grid-cols-2">
        <ModeCard
          active={mode === "import"}
          title="Enviar por importación"
          description="Elige una importación reciente de empleados. El sistema detecta automáticamente quiénes son elegibles."
          icon={
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
          }
          onClick={() => onModeChange("import")}
        />
        <ModeCard
          active={mode === "manual"}
          title="Selección manual"
          description="Ingresa los IDs de empleados específicos que quieres incluir en este envío."
          icon={
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          }
          onClick={() => onModeChange("manual")}
        />
      </div>

      {/* Panel de importación */}
      {mode === "import" && (
        <Card>
          <CardHeader>
            <h3 className="text-sm font-bold text-text-primary">Selecciona una importación</h3>
            <p className="mt-0.5 text-xs text-text-muted">
              Solo aparecen importaciones que ya fueron aplicadas al sistema.
            </p>
          </CardHeader>
          <CardBody className="flex flex-col gap-4">
            {loadingImports && (
              <div className="flex flex-col gap-2">
                {[1, 2].map((i) => (
                  <div key={i} className="h-14 animate-pulse rounded-xl bg-surface-muted" />
                ))}
              </div>
            )}

            {importsError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {importsError}
              </div>
            )}

            {!loadingImports && !importsError && imports.length === 0 && (
              <EmptyState
                title="Sin importaciones disponibles"
                description="No hay importaciones aplicadas. Ve a la sección de Importaciones para cargar y aplicar un archivo CSV primero."
                action={
                  <a href="/imports">
                    <Button variant="secondary">Ir a Importaciones</Button>
                  </a>
                }
              />
            )}

            {!loadingImports && imports.length > 0 && (
              <div className="flex flex-col gap-2">
                {imports.map((imp) => {
                  const isSelected = selectedImportId === imp.id;
                  return (
                    <button
                      key={imp.id}
                      type="button"
                      onClick={() => onImportChange(imp.id)}
                      className={[
                        "flex w-full items-center gap-4 rounded-xl border px-4 py-3 text-left transition-all",
                        isSelected
                          ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20"
                          : "border-border bg-surface hover:border-primary/30 hover:bg-surface-muted/40",
                      ].join(" ")}
                    >
                      {/* Radio visual */}
                      <span
                        className={[
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                          isSelected
                            ? "border-primary bg-primary"
                            : "border-border-strong bg-background",
                        ].join(" ")}
                      >
                        {isSelected && (
                          <span className="h-2 w-2 rounded-full bg-white" />
                        )}
                      </span>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-text-primary">
                          {imp.filename ?? "Importación sin nombre"}
                        </p>
                        <p className="mt-0.5 text-xs text-text-muted">
                          {imp.total_rows != null ? `${imp.total_rows} empleados` : "Sin datos de total"}
                          {imp.applied_at && ` · Aplicada el ${fmtDate(imp.applied_at)}`}
                        </p>
                      </div>

                      {imp.total_rows != null && (
                        <span className="shrink-0 rounded-lg bg-surface-muted px-2.5 py-1 text-xs font-bold text-text-muted">
                          {imp.total_rows}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {/* Panel manual */}
      {mode === "manual" && (
        <Card>
          <CardHeader>
            <h3 className="text-sm font-bold text-text-primary">IDs de empleados</h3>
            <p className="mt-0.5 text-xs text-text-muted">
              Ingresa los IDs internos separados por coma o en líneas separadas. Se verificará la elegibilidad en el siguiente paso.
            </p>
          </CardHeader>
          <CardBody>
            <textarea
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-mono text-text-primary placeholder:text-text-disabled focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              rows={6}
              placeholder={"uuid-empleado-1\nuuid-empleado-2\nuuid-empleado-3"}
              defaultValue={manualIds.join("\n")}
              onChange={(e) => {
                const ids = e.target.value
                  .split(/[\n,]+/)
                  .map((s) => s.trim())
                  .filter(Boolean);
                onManualIdsChange(ids);
              }}
            />
            {manualIds.length > 0 && (
              <p className="mt-2 text-xs text-text-muted">
                <span className="font-semibold text-text-primary">{manualIds.length}</span> ID
                {manualIds.length !== 1 ? "s" : ""} ingresado{manualIds.length !== 1 ? "s" : ""}
              </p>
            )}
          </CardBody>
        </Card>
      )}

      {/* Detalle importación seleccionada */}
      {mode === "import" && selectedImport && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
          <p className="font-semibold text-primary">
            Importación seleccionada:{" "}
            <span className="text-text-primary">{selectedImport.filename ?? "Sin nombre"}</span>
          </p>
          <p className="mt-0.5 text-xs text-text-muted">
            El siguiente paso verificará cuántos empleados de esta importación son elegibles para recibir el mensaje.
          </p>
        </div>
      )}

      {/* ── Panel de envío de prueba ─────────────────────────────────────── */}
      <div className="rounded-2xl border border-dashed border-border bg-surface-muted/30">
        <button
          type="button"
          onClick={() => setTestPanelOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left"
        >
          <div className="flex items-center gap-2.5">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100">
              <svg className="h-3.5 w-3.5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15M14.25 3.104c.251.023.501.05.75.082M19.8 15l-1.558.4A11.5 11.5 0 0112 17.25a11.5 11.5 0 01-6.242-1.85L4.2 15m15.6 0l-1.558.4A11.5 11.5 0 0112 17.25" />
              </svg>
            </span>
            <div>
              <p className="text-sm font-semibold text-text-primary">Envío de prueba</p>
              <p className="text-xs text-text-muted">Busca un empleado específico y envíale el mensaje solo a él.</p>
            </div>
          </div>
          <svg
            className={["h-4 w-4 shrink-0 text-text-muted transition-transform", testPanelOpen ? "rotate-180" : ""].join(" ")}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </button>

        {testPanelOpen && (
          <div className="border-t border-border px-5 pb-5 pt-4 flex flex-col gap-4">
            <p className="text-xs text-text-muted">
              Útil para probar el flujo completo antes de un envío masivo. Solo se enviará el mensaje a la persona que selecciones.
            </p>

            <EmployeeSearchBar
              selected={testEmployee}
              onSelect={(emp) => {
                setTestEmployee(emp);
                // Cambiar modo a manual y cargar el ID
                onModeChange("manual");
                onManualIdsChange([emp.employee_id]);
              }}
              onClear={() => {
                setTestEmployee(null);
                onManualIdsChange([]);
              }}
            />

            {testEmployee && (
              <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <svg className="h-4 w-4 shrink-0 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                <p className="text-xs text-amber-800">
                  Se enviará <strong>solo a {[testEmployee.nombre, testEmployee.apellidos].filter(Boolean).join(" ") || "este empleado"}</strong> en el número{" "}
                  <span className="font-mono font-semibold">{testEmployee.telefono_normalizado ?? "sin teléfono"}</span>.
                </p>
              </div>
            )}

            {testEmployee && (
              <div className="flex justify-end">
                <Button onClick={onNext}>
                  Continuar con esta persona
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Acción principal */}
      <div className="flex justify-end">
        <Button disabled={!canContinue} onClick={onNext}>
          Siguiente: Elegir mensaje
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
          </svg>
        </Button>
      </div>
    </div>
  );
}

function ModeCard({
  active,
  title,
  description,
  icon,
  onClick,
}: {
  active: boolean;
  title: string;
  description: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex flex-col items-start gap-3 rounded-2xl border p-5 text-left transition-all",
        active
          ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20 shadow-sm"
          : "border-border bg-surface hover:border-primary/30 hover:bg-surface-muted/40",
      ].join(" ")}
    >
      <div
        className={[
          "flex h-10 w-10 items-center justify-center rounded-xl transition-colors",
          active ? "bg-primary text-white" : "bg-surface-muted text-text-muted",
        ].join(" ")}
      >
        {icon}
      </div>
      <div>
        <p className={["text-sm font-bold", active ? "text-primary" : "text-text-primary"].join(" ")}>
          {title}
        </p>
        <p className="mt-1 text-xs text-text-muted leading-relaxed">{description}</p>
      </div>
    </button>
  );
}
