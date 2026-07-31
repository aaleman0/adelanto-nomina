"use client";

import { useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type ConnectionStatus = "idle" | "testing" | "ok" | "error";

export function WhatsAppConfigForm() {
  // Sin access_token ni app_secret: los secretos no viajan al navegador ni se
  // guardan en base. Solo se configuran por variables de entorno.
  const [form, setForm] = useState({
    phone_number_id: "",
    business_number: "",
    webhook_verify_token: "",
  });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [connStatus, setConnStatus] = useState<ConnectionStatus>("idle");
  const [connInfo, setConnInfo] = useState<{ phoneNumber?: string; displayName?: string } | null>(null);
  const [connError, setConnError] = useState<string | null>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch("/api/whatsapp/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      setSaveMsg({ ok: json.ok, text: json.ok ? "Configuración guardada." : (json.error ?? "Error al guardar.") });
    } catch {
      setSaveMsg({ ok: false, text: "Error de red." });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setConnStatus("testing");
    setConnInfo(null);
    setConnError(null);
    try {
      // Sin cuerpo: el endpoint usa las credenciales de las variables de
      // entorno del servidor. El navegador ya no maneja el access token.
      const res = await fetch("/api/whatsapp/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (json.ok) {
        setConnStatus("ok");
        setConnInfo({ phoneNumber: json.phoneNumber, displayName: json.displayName });
      } else {
        setConnStatus("error");
        setConnError(json.error ?? "Error de conexión.");
      }
    } catch {
      setConnStatus("error");
      setConnError("Error de red.");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Card className="p-4">
        <h3 className="text-sm font-medium text-text-muted">Estado de conexión</h3>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className={["h-2.5 w-2.5 rounded-full", connStatus === "ok" ? "bg-emerald-500" : connStatus === "error" ? "bg-red-500" : connStatus === "testing" ? "bg-amber-400" : "bg-border"].join(" ")} />
            <span className="text-sm text-text-primary">
              {connStatus === "idle" && "Sin verificar"}
              {connStatus === "testing" && "Verificando..."}
              {connStatus === "ok" && "Conectado"}
              {connStatus === "error" && "Error"}
            </span>
          </div>
          {connInfo && <span className="text-sm text-text-muted">{connInfo.displayName} · {connInfo.phoneNumber}</span>}
          {connError && <span className="text-sm text-red-600">{connError}</span>}
          <Button variant="secondary" disabled={connStatus === "testing"} onClick={handleTest}>
            {connStatus === "testing" ? "Verificando..." : "Probar"}
          </Button>
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="text-sm font-medium text-text-muted">Configuración</h3>

        <p className="mt-2 rounded-lg border border-border-subtle bg-surface-muted px-4 py-3 text-sm text-text-muted">
          El <strong className="text-text-primary">Access Token</strong> y el{" "}
          <strong className="text-text-primary">App Secret</strong> ya no se guardan aquí.
          Se configuran con las variables de entorno{" "}
          <code className="font-data">WHATSAPP_ACCESS_TOKEN</code> y{" "}
          <code className="font-data">WHATSAPP_APP_SECRET</code>, porque en base de datos
          quedaban sin cifrar y las variables de entorno tienen precedencia de todas formas.
          <br />
          <span className="mt-2 block">
            Lo mismo aplica a los campos de abajo: el runtime lee el{" "}
            <strong className="text-text-primary">Phone Number ID</strong> y el{" "}
            <strong className="text-text-primary">Webhook Verify Token</strong> de{" "}
            <code className="font-data">WHATSAPP_PHONE_NUMBER_ID</code> y{" "}
            <code className="font-data">WHATSAPP_WEBHOOK_VERIFY_TOKEN</code>, <strong className="text-text-primary">no</strong> de
            lo guardado aquí. Estos valores son solo una referencia visible en el panel; la
            configuración operativa se cambia en las variables de entorno del despliegue.
          </span>
        </p>

        <form className="mt-3 flex flex-col gap-4" onSubmit={handleSave}>
          <Field label="Phone Number ID" name="phone_number_id" placeholder="1234567890" value={form.phone_number_id} onChange={handleChange} />
          <Field label="Número de negocio" name="business_number" placeholder="521XXXXXXXXXX" value={form.business_number} onChange={handleChange} />
          <Field label="Webhook Verify Token" name="webhook_verify_token" placeholder="token" value={form.webhook_verify_token} onChange={handleChange} />

          {saveMsg && (
            <div className={["rounded-lg border px-4 py-3 text-sm", saveMsg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"].join(" ")}>
              {saveMsg.text}
            </div>
          )}

          <Button type="submit" disabled={saving}>{saving ? "Guardando..." : "Guardar"}</Button>
        </form>
      </Card>

      <Card className="p-4">
        <h3 className="text-sm font-medium text-text-muted">Herramientas</h3>
        <Link href="/settings/whatsapp/phone-audit" className="mt-3 inline-block text-sm font-medium text-primary hover:underline">
          Auditoría de teléfonos
        </Link>
      </Card>

      <Card className="p-4">
        <h3 className="text-sm font-medium text-text-muted">Webhooks</h3>
        <code className="mt-3 block break-all rounded bg-surface-muted px-3 py-2 font-mono text-xs text-text-primary">
          https://TU_DOMINIO/api/webhooks/whatsapp
        </code>
      </Card>
    </div>
  );
}

function Field({
  label,
  name,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-text-primary" htmlFor={name}>{label}</label>
      <input
        id={name}
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-text-primary outline-none focus:border-primary"
        autoComplete="off"
      />
    </div>
  );
}
