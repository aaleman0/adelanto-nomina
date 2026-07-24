"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useHasRole } from "@/components/auth/role-context";
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

const ISSUE_META: Record<PhoneIssue, { label: string; color: string; fixable: boolean }> = {
  ok: { label: "Correcto", color: "text-emerald-700 bg-emerald-50 border-emerald-200", fixable: false },
  long_distance: { label: "Larga distancia", color: "text-amber-700 bg-amber-50 border-amber-200", fixable: true },
  missing_prefix: { label: "Sin prefijo 52", color: "text-amber-700 bg-amber-50 border-amber-200", fixable: true },
  has_plus: { label: "Tiene +", color: "text-amber-700 bg-amber-50 border-amber-200", fixable: true },
  too_short: { label: "Muy corto", color: "text-red-700 bg-red-50 border-red-200", fixable: false },
  too_long: { label: "Muy largo", color: "text-red-700 bg-red-50 border-red-200", fixable: false },
  null_or_empty: { label: "Sin teléfono", color: "text-red-700 bg-red-50 border-red-200", fixable: false },
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
  const canFix = useHasRole("admin");

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
    <div className="flex flex-col gap-5">
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-medium text-text-primary">Auditoría de teléfonos</h2>
            <p className="text-sm text-text-muted">Detecta formatos que Meta rechazaría.</p>
          </div>
          <Button onClick={runAudit} disabled={loading}>
            {loading ? "Analizando..." : "Analizar"}
          </Button>
        </div>
      </Card>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {fixResult && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          {fixResult.fixed} teléfono{fixResult.fixed !== 1 ? "s" : ""} corregido{fixResult.fixed !== 1 ? "s" : ""}.
          {fixResult.errors > 0 && <span className="text-amber-700"> {fixResult.errors} error{fixResult.errors !== 1 ? "es" : ""}.</span>}
        </div>
      )}

      {result && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Total" value={result.total} />
            <StatCard label="Correctos" value={result.ok_count} color="text-emerald-600" />
            <StatCard label="Problemas" value={result.issues} color={result.issues > 0 ? "text-red-600" : "text-text-primary"} />
          </div>

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
                    "rounded-lg border px-3 py-1.5 text-xs font-medium transition",
                    filterIssue === issue ? meta.color : "border-border bg-surface text-text-muted hover:bg-surface-muted",
                  ].join(" ")}
                >
                  {meta.label} <span className="font-bold">{count}</span>
                </button>
              );
            })}
          </div>

          {fixableCount > 0 && (
            <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm text-amber-900">
                {fixableCount} teléfono{fixableCount !== 1 ? "s" : ""} se pueden corregir automáticamente.
              </p>
              <Button variant="secondary" disabled={fixing || !canFix} onClick={applyFixes} title={canFix ? undefined : "Requiere rol administrador."}>
                {fixing ? "Corrigiendo..." : `Corregir ${fixableCount}`}
              </Button>
            </div>
          )}

          <Card className="overflow-hidden p-4">
            <h3 className="text-sm font-medium text-text-muted">
              {filterIssue === "all" ? "Empleados" : ISSUE_META[filterIssue].label} ({filteredRows.length})
            </h3>
            {filteredRows.length === 0 ? (
              <p className="mt-3 text-sm text-text-muted">Sin resultados.</p>
            ) : (
              <div className="mt-3 min-w-[560px] divide-y divide-border">
                <div className="grid grid-cols-[1fr_120px_120px_140px] items-center gap-4 py-2 text-xs font-medium text-text-muted">
                  <span>Empleado</span>
                  <span>Teléfono</span>
                  <span>Estado</span>
                  <span>Corrección</span>
                </div>
                {filteredRows.map((row) => {
                  const meta = ISSUE_META[row.issue];
                  const fullName = [row.nombre, row.apellidos].filter(Boolean).join(" ") || "—";
                  return (
                    <div key={row.employee_id} className="grid grid-cols-[1fr_120px_120px_140px] items-center gap-4 py-3 text-sm">
                      <span className="text-text-primary">{fullName}</span>
                      <span className="text-text-muted">{row.telefono_normalizado ?? "—"}</span>
                      <span className={`inline-flex w-fit rounded-full border px-2 py-0.5 text-xs font-medium ${meta.color}`}>
                        {meta.label}
                      </span>
                      <span className="text-text-muted">
                        {row.suggested_fix ? <span className="text-emerald-700">→ {row.suggested_fix}</span> : "Manual"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3 text-center">
      <p className="text-xs text-text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${color ?? "text-text-primary"}`}>{value}</p>
    </div>
  );
}
