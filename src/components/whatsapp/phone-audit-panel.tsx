"use client";

import { useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { PhoneAuditRow } from "@/app/api/whatsapp/phone-audit/route";
import type { PhoneIssue } from "@/lib/whatsapp/phone-utils";

type AuditResult = {
  ok: boolean;
  total: number;
  ok_count: number;
  issues: number;
  by_issue: Partial<Record<PhoneIssue, number>>;
  rows: PhoneAuditRow[];
};

const ISSUE_META: Record<PhoneIssue, { label: string; color: string; icon: string; fixable: boolean; help: string }> = {
  ok: {
    label: "Correcto",
    color: "text-emerald-700 bg-emerald-50 border-emerald-200",
    icon: "✓",
    fixable: false,
    help: "Formato válido para Meta (52XXXXXXXXXX).",
  },
  long_distance: {
    label: "Larga distancia",
    color: "text-amber-700 bg-amber-50 border-amber-200",
    icon: "!",
    fixable: true,
    help: "Tiene '1' de larga distancia (521XXXXXXXXXX). Se puede corregir automáticamente a 52XXXXXXXXXX.",
  },
  missing_prefix: {
    label: "Sin prefijo 52",
    color: "text-amber-700 bg-amber-50 border-amber-200",
    icon: "!",
    fixable: true,
    help: "10 dígitos sin prefijo de país. Se puede corregir automáticamente agregando 52.",
  },
  has_plus: {
    label: "Tiene +",
    color: "text-blue-700 bg-blue-50 border-blue-200",
    icon: "~",
    fixable: true,
    help: "Tiene '+' al inicio. Meta lo acepta, pero normalizamos para consistencia.",
  },
  too_short: {
    label: "Muy corto",
    color: "text-red-700 bg-red-50 border-red-200",
    icon: "✕",
    fixable: false,
    help: "Menos de 10 dígitos. No se puede corregir automáticamente.",
  },
  too_long: {
    label: "Muy largo",
    color: "text-red-700 bg-red-50 border-red-200",
    icon: "✕",
    fixable: false,
    help: "Formato desconocido. Requiere corrección manual.",
  },
  null_or_empty: {
    label: "Sin teléfono",
    color: "text-red-700 bg-red-50 border-red-200",
    icon: "✕",
    fixable: false,
    help: "No tiene teléfono registrado. No recibirá mensajes de WhatsApp.",
  },
};

const ISSUE_ORDER: PhoneIssue[] = [
  "null_or_empty",
  "too_short",
  "too_long",
  "long_distance",
  "missing_prefix",
  "has_plus",
  "ok",
];

export function PhoneAuditPanel() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filterIssue, setFilterIssue] = useState<PhoneIssue | "all">("all");
  const [fixing, setFixing] = useState(false);
  const [fixResult, setFixResult] = useState<{ fixed: number; errors: number } | null>(null);

  async function runAudit() {
    setLoading(true);
    setError(null);
    setFixResult(null);
    try {
      const res = await fetch("/api/whatsapp/phone-audit");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Error al auditar.");
      setResult(json as AuditResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setLoading(false);
    }
  }

  async function applyFixes() {
    if (!result) return;
    setFixing(true);
    setFixResult(null);
    try {
      const toFix = result.rows.filter((r) => r.suggested_fix !== null && r.issue !== "ok");
      const res = await fetch("/api/whatsapp/phone-audit/fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fixes: toFix.map((r) => ({ employee_id: r.employee_id, telefono_normalizado: r.suggested_fix })) }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Error al corregir.");
      setFixResult({ fixed: json.fixed, errors: json.errors ?? 0 });
      // Re-auditar para ver el nuevo estado
      await runAudit();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al corregir.");
    } finally {
      setFixing(false);
    }
  }

  const filteredRows = result
    ? filterIssue === "all"
      ? result.rows
      : result.rows.filter((r) => r.issue === filterIssue)
    : [];

  const fixableCount = result
    ? result.rows.filter((r) => r.suggested_fix !== null && r.issue !== "ok").length
    : 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Cabecera */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-text-primary">Auditoría de teléfonos</h2>
              <p className="mt-0.5 text-sm text-text-muted">
                Detecta teléfonos en la base de datos que Meta rechazaría al enviar mensajes de WhatsApp.
              </p>
            </div>
            <Button onClick={runAudit} disabled={loading}>
              {loading ? (
                <><Spinner /> Analizando...</>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                  </svg>
                  Analizar teléfonos
                </>
              )}
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Fix result */}
      {fixResult && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <strong>{fixResult.fixed} teléfono{fixResult.fixed !== 1 ? "s" : ""} corregido{fixResult.fixed !== 1 ? "s" : ""}</strong>
          {fixResult.errors > 0 && <span className="text-amber-700"> · {fixResult.errors} error{fixResult.errors !== 1 ? "es" : ""}</span>}.
          La tabla se actualizó automáticamente.
        </div>
      )}

      {result && (
        <>
          {/* Stats por categoría */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <StatCard
              label="Total empleados"
              value={result.total}
              color="text-text-primary"
              active={filterIssue === "all"}
              onClick={() => setFilterIssue("all")}
            />
            <StatCard
              label="Correctos"
              value={result.ok_count}
              color="text-emerald-700"
              active={filterIssue === "ok"}
              onClick={() => setFilterIssue("ok")}
            />
            <StatCard
              label="Con problemas"
              value={result.issues}
              color={result.issues > 0 ? "text-red-600" : "text-emerald-700"}
              active={false}
              onClick={() => setFilterIssue("all")}
            />
            <StatCard
              label="Corregibles auto."
              value={fixableCount}
              color={fixableCount > 0 ? "text-amber-700" : "text-emerald-700"}
              active={false}
              onClick={() => setFilterIssue("all")}
            />
          </div>

          {/* Filtros por tipo de problema */}
          <div className="flex flex-wrap gap-2">
            {ISSUE_ORDER.filter((i) => (result.by_issue[i] ?? 0) > 0).map((issue) => {
              const meta = ISSUE_META[issue];
              const count = result.by_issue[issue] ?? 0;
              return (
                <button
                  key={issue}
                  type="button"
                  onClick={() => setFilterIssue(filterIssue === issue ? "all" : issue)}
                  className={[
                    "flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition",
                    filterIssue === issue ? meta.color + " ring-2 ring-offset-1" : "border-border bg-surface text-text-muted hover:bg-surface-muted",
                  ].join(" ")}
                  title={meta.help}
                >
                  <span>{meta.icon}</span>
                  {meta.label}
                  <span className="font-bold">{count}</span>
                </button>
              );
            })}
          </div>

          {/* Botón de corrección automática */}
          {fixableCount > 0 && (
            <div className="flex items-center gap-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-900">
                  {fixableCount} teléfono{fixableCount !== 1 ? "s" : ""} tienen corrección automática disponible
                </p>
                <p className="mt-0.5 text-xs text-amber-700">
                  Larga distancia, prefijo faltante o símbolo &ldquo;+&rdquo; — se pueden corregir en la DB directamente.
                </p>
              </div>
              <Button
                variant="secondary"
                disabled={fixing}
                onClick={applyFixes}
                className="shrink-0"
              >
                {fixing ? <><Spinner /> Corrigiendo...</> : `Corregir ${fixableCount}`}
              </Button>
            </div>
          )}

          {/* Tabla de resultados */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-text-primary">
                  {filterIssue === "all"
                    ? `Todos los empleados (${filteredRows.length})`
                    : `${ISSUE_META[filterIssue].label} (${filteredRows.length})`}
                </h3>
                {filterIssue !== "all" && (
                  <p className="text-xs text-text-muted">{ISSUE_META[filterIssue].help}</p>
                )}
              </div>
            </CardHeader>
            <CardBody className="p-0">
              {filteredRows.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-text-muted">Sin resultados.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-surface-muted">
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-muted">Empleado</th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-muted">RFC</th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-muted">Empleador</th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-muted">Teléfono actual</th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-muted">Estado</th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-muted">Corrección</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredRows.map((row) => {
                        const meta = ISSUE_META[row.issue];
                        const fullName = [row.nombre, row.apellidos].filter(Boolean).join(" ") || "—";
                        return (
                          <tr key={row.employee_id} className="hover:bg-surface-muted/50">
                            <td className="px-4 py-2.5 font-medium text-text-primary">{fullName}</td>
                            <td className="px-4 py-2.5 font-mono text-text-muted">{row.rfc ?? "—"}</td>
                            <td className="px-4 py-2.5 text-text-muted">{row.empleador ?? "—"}</td>
                            <td className="px-4 py-2.5 font-mono text-text-primary">
                              {row.telefono_normalizado ?? <span className="italic text-text-disabled">vacío</span>}
                            </td>
                            <td className="px-4 py-2.5">
                              <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${meta.color}`}>
                                {meta.icon} {meta.label}
                              </span>
                            </td>
                            <td className="px-4 py-2.5">
                              {row.suggested_fix ? (
                                <span className="font-mono text-xs text-emerald-700">→ {row.suggested_fix}</span>
                              ) : row.issue === "ok" ? (
                                <span className="text-xs text-text-disabled">—</span>
                              ) : (
                                <span className="text-xs text-red-500">Manual</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, color, active, onClick }: { label: string; value: number; color: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={["rounded-2xl border p-4 text-left transition hover:bg-surface-muted", active ? "border-primary/40 bg-primary/5" : "border-border bg-surface"].join(" ")}
    >
      <p className="text-xs font-semibold text-text-muted">{label}</p>
      <p className={`mt-1 text-3xl font-extrabold ${color}`}>{value}</p>
    </button>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
