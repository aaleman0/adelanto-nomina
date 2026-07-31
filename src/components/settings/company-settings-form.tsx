"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * Pantalla "Datos de la empresa": edita las constantes del contrato (acreedor +
 * testigos) que son iguales en todos los contratos. Carga los valores actuales,
 * marca los que faltan y guarda en `company_settings` vía /api/settings/company.
 */

const ACREEDOR_FIELDS = [
  { name: "acreedor_razon_social", label: "Razón social" },
  { name: "acreedor_rfc", label: "RFC" },
  { name: "acreedor_representante", label: "Representante legal" },
  { name: "acreedor_domicilio", label: "Domicilio" },
  { name: "acreedor_banco", label: "Banco" },
  { name: "acreedor_cuenta", label: "Cuenta" },
  { name: "acreedor_clabe", label: "CLABE" },
] as const;

const TESTIGO_FIELDS = [
  { name: "testigo_1_nombre", label: "Testigo 1 (nombre completo)" },
  { name: "testigo_2_nombre", label: "Testigo 2 (nombre completo)" },
] as const;

const ALL_NAMES = [...ACREEDOR_FIELDS, ...TESTIGO_FIELDS].map((f) => f.name);
const EMPTY: Record<string, string> = Object.fromEntries(ALL_NAMES.map((n) => [n, ""]));

export function CompanySettingsForm() {
  const [form, setForm] = useState<Record<string, string>>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/settings/company")
      .then((r) => r.json())
      .then((json) => {
        if (json.ok && json.config) setForm({ ...EMPTY, ...json.config });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setMsg(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/settings/company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      setMsg({ ok: json.ok, text: json.ok ? "Datos guardados." : (json.error ?? "Error al guardar.") });
    } catch {
      setMsg({ ok: false, text: "Error de red." });
    } finally {
      setSaving(false);
    }
  }

  const faltantes = ALL_NAMES.filter((n) => !form[n]?.trim()).length;

  return (
    <form className="flex flex-col gap-5" onSubmit={handleSave}>
      <Card className="p-4">
        <p className="text-sm text-text-muted">
          Estos datos son los <strong className="text-text-primary">mismos en todos los contratos</strong> (el
          acreedor que otorga el adelanto y los testigos). Se ponen una sola vez y el contrato de cada empleado
          los usa. <strong className="text-text-primary">Los campos vacíos salen en blanco en el contrato.</strong>
        </p>
        {!loading && faltantes > 0 && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Faltan <strong>{faltantes}</strong> {faltantes === 1 ? "campo" : "campos"} por llenar.
          </p>
        )}
      </Card>

      <Card className="p-4">
        <h3 className="text-sm font-medium text-text-muted">Acreedor (quien otorga el adelanto)</h3>
        <div className="mt-3 flex flex-col gap-4">
          {ACREEDOR_FIELDS.map((f) => (
            <Field key={f.name} label={f.label} name={f.name} value={form[f.name]} onChange={handleChange} loading={loading} />
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="text-sm font-medium text-text-muted">Testigos del contrato</h3>
        <div className="mt-3 flex flex-col gap-4">
          {TESTIGO_FIELDS.map((f) => (
            <Field key={f.name} label={f.label} name={f.name} value={form[f.name]} onChange={handleChange} loading={loading} />
          ))}
        </div>
      </Card>

      {msg && (
        <div
          className={[
            "rounded-lg border px-4 py-3 text-sm",
            msg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800",
          ].join(" ")}
        >
          {msg.text}
        </div>
      )}

      <div>
        <Button type="submit" disabled={saving || loading}>
          {saving ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  value,
  onChange,
  loading,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  loading?: boolean;
}) {
  const empty = !value?.trim();
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="flex items-center gap-2 text-text-secondary">
        {label}
        {!loading && empty && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">Falta</span>
        )}
      </span>
      <input
        name={name}
        value={value}
        onChange={onChange}
        disabled={loading}
        placeholder={loading ? "Cargando…" : ""}
        className="h-9 rounded-lg border border-border bg-surface px-3 text-sm text-text-primary outline-none focus:border-primary disabled:opacity-60"
      />
    </label>
  );
}
