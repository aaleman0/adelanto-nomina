"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

type TabMode = "import" | "manual";

type RecentImport = {
  id: string;
  original_filename: string | null;
  row_count: number | null;
  applied_at: string | null;
};

type EmployeeRow = {
  employee_id: string;
  nombre: string | null;
  apellidos: string | null;
  rfc: string | null;
  telefono_normalizado: string | null;
  empleador: string | null;
  monto_prestamo_autorizado: number | null;
  eligible: boolean;
  reason?: string;
};

type SendState = "idle" | "validating" | "ready" | "sending" | "done";

type SendResult = {
  total: number;
  eligible: number;
  sent: number;
  failed: number;
  errors: Array<{ employeeId: string; rfc?: string | null; error: string }>;
};

const fmt = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const fmtDate = (d: string | null) => d ? new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(new Date(d)) : "-";

export function BulkSendForm() {
  const [tab, setTab] = useState<TabMode>("import");
  const [imports, setImports] = useState<RecentImport[]>([]);
  const [selectedImportId, setSelectedImportId] = useState("");
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sendState, setSendState] = useState<SendState>("idle");
  const [result, setResult] = useState<SendResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState("adelanto_contrato");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const toastify = useToast();

  // Cargar importaciones recientes
  useEffect(() => {
    fetch("/api/whatsapp/imports")
      .then((r) => r.json())
      .then((json) => {
        if (json.ok) setImports(json.imports ?? []);
      })
      .catch(() => {});
  }, []);

  // Cargar y validar employees de la importación seleccionada
  const loadAndValidate = useCallback(async (importId: string) => {
    if (!importId) return;
    setSendState("validating");
    setEmployees([]);
    setSelected(new Set());
    setError(null);

    try {
      const [empRes, valRes] = await Promise.all([
        fetch(`/api/whatsapp/imports?importId=${importId}`).then((r) => r.json()),
        fetch("/api/whatsapp/bulk?action=validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "import", importId }),
        }).then((r) => r.json()),
      ]);

      if (!empRes.ok) throw new Error(empRes.error ?? "Error al cargar employees.");
      if (!valRes.ok) throw new Error(valRes.error ?? "Error al validar elegibilidad.");

      const empList: EmployeeRow[] = (empRes.employees ?? []).map((e: EmployeeRow) => {
        const val = (valRes.employees ?? []).find((v: EmployeeRow) => v.employee_id === e.employee_id);
        return { ...e, eligible: val?.eligible ?? false, reason: val?.reason };
      });

      setEmployees(empList);
      setSelected(new Set(empList.filter((e) => e.eligible).map((e) => e.employee_id)));
      setSendState("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error.");
      setSendState("idle");
    }
  }, []);

  function toggleEmployee(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllEligible() {
    setSelected(new Set(employees.filter((e) => e.eligible).map((e) => e.employee_id)));
  }

  function deselectAll() {
    setSelected(new Set());
  }

  async function handleSend() {
    if (selected.size === 0) return;
    setSendState("sending");
    setResult(null);
    setError(null);

    try {
      const payload =
        tab === "import"
          ? { mode: "import", importId: selectedImportId, employeeIds: [...selected], templateName }
          : { mode: "manual", employeeIds: [...selected], templateName };

      const res = await fetch("/api/whatsapp/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();

      if (!json.ok) throw new Error(json.error ?? "Error al enviar.");
      setResult(json as SendResult);
      setSendState("done");
      toastify.success(
        `Envío completado: ${(json as SendResult).sent} enviados, ${(json as SendResult).failed} errores.`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error.";
      setError(msg);
      setSendState("ready");
      toastify.error(`Error al enviar mensajes: ${msg}`);
    }
  }

  const eligibleCount = employees.filter((e) => e.eligible).length;
  const selectedEligible = employees.filter((e) => selected.has(e.employee_id) && e.eligible).length;

  return (
    <div className="flex flex-col gap-6">
      {/* Tabs */}
      <div className="flex gap-2 border-b border-border">
        {(["import", "manual"] as TabMode[]).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setSendState("idle"); setEmployees([]); setSelected(new Set()); setResult(null); setError(null); }}
            className={[
              "px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors",
              tab === t
                ? "border-primary text-primary"
                : "border-transparent text-text-muted hover:text-text-primary",
            ].join(" ")}
          >
            {t === "import" ? "Por Importación" : "Por Selección Manual"}
          </button>
        ))}
      </div>

      {/* Template Name */}
      <Card>
        <CardHeader>
          <h3 className="text-h2 font-semibold text-text-primary">Template de WhatsApp</h3>
        </CardHeader>
        <CardBody>
          <div className="flex flex-col gap-1.5 max-w-sm">
            <label className="text-sm font-semibold text-text-primary" htmlFor="templateName">
              Nombre del template
            </label>
            <input
              id="templateName"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              className="h-10 rounded-base border border-border bg-background px-3 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="adelanto_contrato"
            />
            <p className="text-xs text-text-muted">Nombre exacto del template aprobado en Meta Business.</p>
          </div>
        </CardBody>
      </Card>

      {/* Tab: Por Importación */}
      {tab === "import" && (
        <Card>
          <CardHeader>
            <h3 className="text-h2 font-semibold text-text-primary">Seleccionar Importación</h3>
          </CardHeader>
          <CardBody className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5 max-w-md">
              <label className="text-sm font-semibold text-text-primary">Importación</label>
              <select
                className="h-10 rounded-base border border-border bg-background px-3 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={selectedImportId}
                onChange={(e) => {
                  setSelectedImportId(e.target.value);
                  if (e.target.value) loadAndValidate(e.target.value);
                }}
              >
                <option value="">Selecciona una importación...</option>
                {imports.map((imp) => (
                  <option key={imp.id} value={imp.id}>
                    {imp.original_filename ?? imp.id} · {imp.row_count ?? "?"} filas · {fmtDate(imp.applied_at)}
                  </option>
                ))}
              </select>
            </div>

            {sendState === "validating" && (
              <p className="text-sm text-text-muted animate-pulse">Cargando y validando elegibilidad...</p>
            )}

            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}
          </CardBody>
        </Card>
      )}

      {/* Tab: Manual (placeholder - para siguiente iteración) */}
      {tab === "manual" && (
        <Card>
          <CardHeader>
            <h3 className="text-h2 font-semibold text-text-primary">Selección Manual</h3>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-text-muted">Ingresa los IDs de employee separados por coma o línea:</p>
            <textarea
              className="mt-3 w-full rounded-base border border-border bg-background px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              rows={5}
              placeholder="uuid-1, uuid-2, ..."
              onChange={(e) => {
                const ids = e.target.value.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
                setSelected(new Set(ids));
              }}
            />
            <div className="mt-3 flex gap-2">
              <Button
                variant="secondary"
                disabled={selected.size === 0}
                onClick={async () => {
                  setSendState("validating");
                  try {
                    const res = await fetch("/api/whatsapp/bulk?action=validate", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ mode: "manual", employeeIds: [...selected] }),
                    });
                    const json = await res.json();
                    if (!json.ok) throw new Error(json.error);
                    setEmployees(json.employees ?? []);
                    setSendState("ready");
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Error.");
                    setSendState("idle");
                  }
                }}
              >
                Validar elegibilidad
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Lista de employees con elegibilidad */}
      {employees.length > 0 && sendState !== "validating" && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-h2 font-semibold text-text-primary">Employees</h3>
                <p className="text-sm text-text-muted">
                  <span className="font-semibold text-emerald-600">{eligibleCount} elegibles</span>
                  {" "}de {employees.length} totales ·{" "}
                  <span className="font-semibold text-primary">{selectedEligible} seleccionados</span>
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={selectAllEligible}>Seleccionar elegibles</Button>
                <Button variant="ghost" onClick={deselectAll}>Limpiar</Button>
              </div>
            </div>
          </CardHeader>
          <CardBody>
            <div className="max-h-[400px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface-muted">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-text-muted w-10"></th>
                    <th className="px-3 py-2 text-left font-semibold text-text-muted">Nombre</th>
                    <th className="px-3 py-2 text-left font-semibold text-text-muted">RFC</th>
                    <th className="px-3 py-2 text-left font-semibold text-text-muted">Teléfono</th>
                    <th className="px-3 py-2 text-left font-semibold text-text-muted">Monto</th>
                    <th className="px-3 py-2 text-left font-semibold text-text-muted">Elegibilidad</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((emp, i) => (
                    <tr
                      key={emp.employee_id}
                      className={[
                        "border-t border-border transition-colors",
                        i % 2 === 0 ? "bg-background" : "bg-surface-muted/40",
                        emp.eligible ? "hover:bg-primary/5 cursor-pointer" : "opacity-50 cursor-not-allowed",
                      ].join(" ")}
                      onClick={() => emp.eligible && toggleEmployee(emp.employee_id)}
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selected.has(emp.employee_id)}
                          disabled={!emp.eligible}
                          onChange={() => toggleEmployee(emp.employee_id)}
                          className="rounded"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                      <td className="px-3 py-2 font-medium text-text-primary">
                        {[emp.nombre, emp.apellidos].filter(Boolean).join(" ") || "-"}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-text-muted">{emp.rfc || "-"}</td>
                      <td className="px-3 py-2 font-mono text-xs text-text-muted">{emp.telefono_normalizado || "-"}</td>
                      <td className="px-3 py-2 text-text-primary">
                        {emp.monto_prestamo_autorizado ? fmt.format(emp.monto_prestamo_autorizado) : "-"}
                      </td>
                      <td className="px-3 py-2">
                        {emp.eligible ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            Elegible
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-red-200" title={emp.reason}>
                            <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                            {emp.reason ?? "No elegible"}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Preview y botón enviar */}
      {(sendState === "ready" || sendState === "sending") && selectedEligible > 0 && (
        <Card>
          <CardHeader>
            <h3 className="text-h2 font-semibold text-text-primary">Confirmar envío</h3>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-text-muted mb-4">
              Se enviará el template <span className="font-semibold text-text-primary">{templateName}</span> a{" "}
              <span className="font-semibold text-primary">{selectedEligible} employees</span> elegibles.
            </p>
            {sendState === "sending" && (
              <div className="mb-4 rounded-base border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 animate-pulse">
                Enviando mensajes... Por favor espera.
              </div>
            )}
            {error && (
              <div className="mb-4 rounded-base border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
                {error}
              </div>
            )}
            <Button disabled={sendState === "sending"} onClick={() => setConfirmOpen(true)}>
              {sendState === "sending" ? "Enviando..." : `Enviar mensajes a ${selectedEligible} employees`}
            </Button>
          </CardBody>
        </Card>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="¿Confirmar envío masivo?"
        description={`Se enviará el template "${templateName}" a ${selectedEligible} empleados vía WhatsApp. Esta acción no se puede deshacer.`}
        confirmLabel={`Enviar a ${selectedEligible} empleados`}
        cancelLabel="Cancelar"
        onConfirm={() => { setConfirmOpen(false); handleSend(); }}
        onCancel={() => setConfirmOpen(false)}
      />

      {/* Resultado final */}
      {sendState === "done" && result && (
        <Card>
          <CardHeader>
            <h3 className="text-h2 font-semibold text-text-primary">Resultado del envío</h3>
          </CardHeader>
          <CardBody className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-4">
              <Stat label="Total" value={result.total} color="text-text-primary" />
              <Stat label="Elegibles" value={result.eligible} color="text-primary" />
              <Stat label="Enviados" value={result.sent} color="text-emerald-600" />
              <Stat label="Errores" value={result.failed} color="text-red-600" />
            </div>

            {result.errors.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-semibold text-text-primary">Detalle de errores:</p>
                <div className="max-h-48 overflow-y-auto rounded-base border border-border">
                  {result.errors.map((e, i) => (
                    <div key={i} className="flex gap-4 border-b border-border px-4 py-2 text-xs last:border-0">
                      <span className="font-mono text-text-muted">{e.rfc ?? e.employeeId}</span>
                      <span className="text-red-600">{e.error}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className={[
              "rounded-base border px-4 py-3 text-sm font-semibold",
              result.failed === 0
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-amber-200 bg-amber-50 text-amber-800",
            ].join(" ")}>
              Envío completado: {result.sent}/{result.eligible} éxitos · {result.failed} errores
            </div>

            <Button variant="secondary" onClick={() => { setSendState("ready"); setResult(null); }}>
              Nuevo envío
            </Button>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-base border border-border bg-surface-muted px-4 py-3 text-center">
      <p className="text-xs font-semibold uppercase text-text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
