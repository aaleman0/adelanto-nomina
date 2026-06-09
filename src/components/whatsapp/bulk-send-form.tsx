"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { useNotifications } from "@/components/ui/notifications";

type TabMode = "import" | "manual";

type RecentImport = {
  id: string;
  filename: string | null;
  total_rows: number | null;
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
  bulkSendId?: string;
  errors: Array<{ employeeId: string; rfc?: string | null; error: string }>;
};

const fmt = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const fmtDate = (d: string | null) =>
  d ? new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(new Date(d)) : "-";

export function BulkSendForm() {
  const [tab, setTab] = useState<TabMode>("import");
  const [imports, setImports] = useState<RecentImport[]>([]);
  const [selectedImportId, setSelectedImportId] = useState("");
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sendState, setSendState] = useState<SendState>("idle");
  const [result, setResult] = useState<SendResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState("adelanto_nomina");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const toastify = useToast();
  const { addNotification } = useNotifications();

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
      const sent = (json as SendResult).sent;
      const failed = (json as SendResult).failed;
      toastify.success(`Envío completado: ${sent} enviados, ${failed} errores.`);
      addNotification({
        type: failed > 0 ? "warning" : "success",
        title: "Envío masivo completado",
        message: `${sent} mensajes enviados${failed > 0 ? `, ${failed} fallidos` : ""}. Ver historial para detalles.`,
        actionUrl: "/whatsapp/history",
        actionLabel: "Ver historial",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error.";
      setError(msg);
      setSendState("ready");
      toastify.error(`Error al enviar mensajes: ${msg}`);
    }
  }

  const eligibleCount = employees.filter((e) => e.eligible).length;
  const selectedEligible = employees.filter((e) => selected.has(e.employee_id) && e.eligible).length;

  // ─── Pantalla de éxito ──────────────────────────────────────────────────────
  if (sendState === "done" && result) {
    const allOk = result.failed === 0;
    return (
      <div className="flex flex-col gap-6">
        {/* Banner de éxito/advertencia */}
        <div
          className={[
            "flex flex-col items-center gap-4 rounded-2xl border px-8 py-10 text-center",
            allOk
              ? "border-emerald-200 bg-emerald-50"
              : "border-amber-200 bg-amber-50",
          ].join(" ")}
        >
          {/* Icono */}
          <div
            className={[
              "grid h-16 w-16 place-items-center rounded-full",
              allOk ? "bg-emerald-100" : "bg-amber-100",
            ].join(" ")}
          >
            {allOk ? (
              <svg
                className="h-8 w-8 text-emerald-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4.5 12.75l6 6 9-13.5"
                />
              </svg>
            ) : (
              <svg
                className="h-8 w-8 text-amber-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                />
              </svg>
            )}
          </div>

          <div>
            <h2
              className={[
                "text-2xl font-bold",
                allOk ? "text-emerald-800" : "text-amber-800",
              ].join(" ")}
            >
              {allOk ? "¡Mensajes enviados!" : "Envío completado con errores"}
            </h2>
            <p
              className={[
                "mt-1 text-sm",
                allOk ? "text-emerald-700" : "text-amber-700",
              ].join(" ")}
            >
              {allOk
                ? `Se enviaron ${result.sent} mensajes de WhatsApp correctamente.`
                : `${result.sent} enviados correctamente · ${result.failed} fallaron.`}
            </p>
          </div>

          {/* Stats */}
          <div className="mt-2 grid w-full max-w-sm grid-cols-3 gap-3">
            <StatBig label="Enviados" value={result.sent} color={allOk ? "text-emerald-700" : "text-amber-700"} />
            <StatBig label="Elegibles" value={result.eligible} color="text-text-primary" />
            <StatBig label="Errores" value={result.failed} color={result.failed > 0 ? "text-red-600" : "text-text-muted"} />
          </div>

          {/* Template usado */}
          <p className="text-xs text-text-muted">
            Template: <span className="font-semibold text-text-primary">{templateName}</span>
          </p>
        </div>

        {/* Detalle de errores */}
        {result.errors.length > 0 && (
          <Card>
            <CardHeader>
              <h3 className="text-h2 font-semibold text-text-primary">
                Detalle de errores ({result.errors.length})
              </h3>
            </CardHeader>
            <CardBody>
              <div className="max-h-48 overflow-y-auto rounded-base border border-border">
                {result.errors.map((e, i) => (
                  <div
                    key={i}
                    className="flex gap-4 border-b border-border px-4 py-2 text-xs last:border-0"
                  >
                    <span className="font-mono text-text-muted">{e.rfc ?? e.employeeId}</span>
                    <span className="text-red-600">{e.error}</span>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        )}

        {/* Acciones post-envío */}
        <div className="flex flex-wrap gap-3">
          <Button
            variant="secondary"
            onClick={() => {
              setSendState("ready");
              setResult(null);
            }}
          >
            Nuevo envío
          </Button>
          <a href="/whatsapp/history">
            <Button variant="ghost">Ver historial de envíos →</Button>
          </a>
        </div>
      </div>
    );
  }

  // ─── Formulario principal ───────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6">
      {/* Tabs */}
      <div className="flex gap-2 border-b border-border">
        {(["import", "manual"] as TabMode[]).map((t) => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              setSendState("idle");
              setEmployees([]);
              setSelected(new Set());
              setResult(null);
              setError(null);
            }}
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
            <p className="text-xs text-text-muted">
              Nombre exacto del template aprobado en Meta Business.
            </p>
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
                    {imp.filename ?? imp.id} · {imp.total_rows ?? "?"} filas · {fmtDate(imp.applied_at)}
                  </option>
                ))}
              </select>
            </div>

            {sendState === "validating" && (
              <p className="text-sm text-text-muted animate-pulse">
                Cargando y validando elegibilidad...
              </p>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}
          </CardBody>
        </Card>
      )}

      {/* Tab: Manual */}
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
                const ids = e.target.value
                  .split(/[\n,]+/)
                  .map((s) => s.trim())
                  .filter(Boolean);
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
                <h3 className="text-h2 font-semibold text-text-primary">Empleados</h3>
                <p className="text-sm text-text-muted">
                  <span className="font-semibold text-emerald-600">{eligibleCount} elegibles</span>
                  {" "}de {employees.length} totales ·{" "}
                  <span className="font-semibold text-primary">{selectedEligible} seleccionados</span>
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={selectAllEligible}>
                  Seleccionar elegibles
                </Button>
                <Button variant="ghost" onClick={deselectAll}>
                  Limpiar
                </Button>
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
                        emp.eligible
                          ? "hover:bg-primary/5 cursor-pointer"
                          : "opacity-50 cursor-not-allowed",
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
                      <td className="px-3 py-2 font-mono text-xs text-text-muted">
                        {emp.rfc || "-"}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-text-muted">
                        {emp.telefono_normalizado || "-"}
                      </td>
                      <td className="px-3 py-2 text-text-primary">
                        {emp.monto_prestamo_autorizado
                          ? fmt.format(emp.monto_prestamo_autorizado)
                          : "-"}
                      </td>
                      <td className="px-3 py-2">
                        {emp.eligible ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            Elegible
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-red-200"
                            title={emp.reason}
                          >
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

      {/* ── Barra de acción fija al fondo ────────────────────────────────────── */}
      {(sendState === "ready" || sendState === "sending") && (
        <div
          className={[
            "sticky bottom-6 z-30 rounded-2xl border shadow-xl px-6 py-4",
            "flex flex-wrap items-center justify-between gap-4",
            selectedEligible > 0
              ? "border-primary/30 bg-white"
              : "border-border bg-surface-muted",
          ].join(" ")}
        >
          {/* Resumen */}
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-bold text-text-primary">
              {selectedEligible > 0
                ? `${selectedEligible} empleado${selectedEligible !== 1 ? "s" : ""} seleccionado${selectedEligible !== 1 ? "s" : ""}`
                : "Ningún empleado seleccionado"}
            </p>
            <p className="text-xs text-text-muted">
              Template:{" "}
              <span className="font-semibold text-text-primary">{templateName}</span>
              {" · "}
              {eligibleCount} elegible{eligibleCount !== 1 ? "s" : ""} en total
            </p>
          </div>

          {/* Estado enviando */}
          {sendState === "sending" && (
            <span className="flex items-center gap-2 text-sm font-semibold text-amber-700 animate-pulse">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
              </svg>
              Enviando mensajes...
            </span>
          )}

          {/* Error inline */}
          {error && sendState !== "sending" && (
            <p className="text-sm font-semibold text-red-600">{error}</p>
          )}

          {/* Botón enviar */}
          <Button
            disabled={sendState === "sending" || selectedEligible === 0}
            onClick={() => setConfirmOpen(true)}
            className="min-w-[200px]"
          >
            {sendState === "sending" ? (
              "Enviando..."
            ) : selectedEligible > 0 ? (
              <>
                <svg
                  className="mr-2 h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
                  />
                </svg>
                Enviar {selectedEligible} mensaje{selectedEligible !== 1 ? "s" : ""}
              </>
            ) : (
              "Selecciona empleados"
            )}
          </Button>
        </div>
      )}

      {/* Modal de confirmación */}
      <ConfirmDialog
        open={confirmOpen}
        title="¿Confirmar envío masivo?"
        description={`Se enviará el template "${templateName}" a ${selectedEligible} empleado${selectedEligible !== 1 ? "s" : ""} vía WhatsApp. Esta acción no se puede deshacer.`}
        confirmLabel={`Enviar ${selectedEligible} mensaje${selectedEligible !== 1 ? "s" : ""}`}
        cancelLabel="Cancelar"
        onConfirm={() => {
          setConfirmOpen(false);
          handleSend();
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

function StatBig({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-3 text-center shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</p>
      <p className={`mt-1 text-3xl font-extrabold ${color}`}>{value}</p>
    </div>
  );
}
