"use client";

import { useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type ConnectionStatus = "idle" | "testing" | "ok" | "error";

export function WhatsAppConfigForm() {
  const [form, setForm] = useState({
    access_token: "",
    phone_number_id: "",
    business_number: "",
    webhook_verify_token: "",
    app_secret: "",
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
      setSaveMsg({ ok: json.ok, text: json.ok ? "Configuración guardada correctamente." : (json.error ?? "Error al guardar.") });
    } catch {
      setSaveMsg({ ok: false, text: "Error de red al guardar." });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setConnStatus("testing");
    setConnInfo(null);
    setConnError(null);
    try {
      const res = await fetch("/api/whatsapp/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token: form.access_token,
          phone_number_id: form.phone_number_id,
        }),
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
    <div className="flex flex-col gap-6">
      {/* Estado de conexión */}
      <Card>
        <CardHeader>
          <h3 className="text-h2 font-semibold text-text-primary">Estado de conexión</h3>
          <p className="text-sm text-text-muted">
            Prueba la conexión con la API de Meta antes de guardar.
          </p>
        </CardHeader>
        <CardBody>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span
                className={[
                  "h-3 w-3 rounded-full",
                  connStatus === "idle" && "bg-border",
                  connStatus === "testing" && "animate-pulse bg-amber-400",
                  connStatus === "ok" && "bg-emerald-500",
                  connStatus === "error" && "bg-red-500",
                ].filter(Boolean).join(" ")}
              />
              <span className="text-sm font-semibold text-text-primary">
                {connStatus === "idle" && "Sin verificar"}
                {connStatus === "testing" && "Verificando..."}
                {connStatus === "ok" && "Conectado"}
                {connStatus === "error" && "Error de conexión"}
              </span>
            </div>
            {connInfo && (
              <span className="text-sm text-text-muted">
                {connInfo.displayName} · {connInfo.phoneNumber}
              </span>
            )}
            {connError && (
              <span className="text-sm text-red-600">{connError}</span>
            )}
            <Button
              variant="secondary"
              disabled={connStatus === "testing" || !form.access_token || !form.phone_number_id}
              onClick={handleTest}
            >
              {connStatus === "testing" ? "Verificando..." : "Probar conexión"}
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Formulario */}
      <Card>
        <CardHeader>
          <h3 className="text-h2 font-semibold text-text-primary">Credenciales de WhatsApp API</h3>
          <p className="text-sm text-text-muted">
            Obtén estos valores desde el{" "}
            <a
              className="text-primary underline"
              href="https://developers.facebook.com/apps"
              target="_blank"
              rel="noopener noreferrer"
            >
              Meta for Developers
            </a>
            .
          </p>
        </CardHeader>
        <CardBody>
          <form className="flex flex-col gap-5" onSubmit={handleSave}>
            <Field
              label="Access Token"
              name="access_token"
              placeholder="EAAxxxxx..."
              type="password"
              value={form.access_token}
              onChange={handleChange}
              hint="Token permanente de la app de Meta. Guárdalo con seguridad."
            />
            <Field
              label="Phone Number ID"
              name="phone_number_id"
              placeholder="1234567890"
              value={form.phone_number_id}
              onChange={handleChange}
              hint="ID numérico del número de WhatsApp Business en Meta."
            />
            <Field
              label="Número de negocio (WhatsApp Business Number)"
              name="business_number"
              placeholder="521XXXXXXXXXX"
              value={form.business_number}
              onChange={handleChange}
              hint="Número en formato internacional sin +, ej: 5215512345678"
            />
            <Field
              label="Webhook Verify Token"
              name="webhook_verify_token"
              placeholder="mi_token_secreto"
              value={form.webhook_verify_token}
              onChange={handleChange}
              hint="Token que Meta usará para verificar tu webhook. Puedes inventarlo."
            />
            <Field
              label="App Secret"
              name="app_secret"
              type="password"
              placeholder="xxxxxxxxxxxxx"
              value={form.app_secret}
              onChange={handleChange}
              hint="Secreto de la app Meta. Usado para validar la firma de webhooks."
            />

            {saveMsg && (
              <div
                className={[
                  "rounded-base border px-4 py-3 text-sm font-semibold",
                  saveMsg.ok
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-red-200 bg-red-50 text-red-800",
                ].join(" ")}
              >
                {saveMsg.text}
              </div>
            )}

            <div className="flex gap-3">
              <Button type="submit" disabled={saving}>
                {saving ? "Guardando..." : "Guardar configuración"}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      {/* Info webhooks */}
      <Card>
        <CardHeader>
          <h3 className="text-h2 font-semibold text-text-primary">Configuración de Webhooks</h3>
        </CardHeader>
        <CardBody>
          <div className="rounded-base border border-border bg-surface-muted px-4 py-4 text-sm">
            <p className="font-semibold text-text-primary">URL del webhook a configurar en Meta:</p>
            <code className="mt-2 block break-all rounded bg-background px-3 py-2 font-mono text-xs text-text-primary">
              https://TU_DOMINIO/api/webhooks/whatsapp
            </code>
            <p className="mt-3 font-semibold text-text-primary">Suscripciones requeridas:</p>
            <ul className="mt-1 list-inside list-disc text-text-muted">
              <li>messages</li>
              <li>message_deliveries</li>
              <li>message_reads</li>
            </ul>
          </div>
        </CardBody>
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
  hint,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  type?: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-semibold text-text-primary" htmlFor={name}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="h-10 rounded-base border border-border bg-background px-3 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        autoComplete="off"
      />
      {hint && <p className="text-xs text-text-muted">{hint}</p>}
    </div>
  );
}
