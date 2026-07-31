"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { SendResult } from "./types";

type Props = {
  result: SendResult;
  templateName: string;
  onNewSend: () => void;
};

export function SendResult({ result, templateName, onNewSend }: Props) {
  const queued = result.status === "queued";
  const allOk = result.failed === 0;

  return (
    <div className="flex flex-col gap-4">
      <Card className={`p-6 text-center ${queued || allOk ? "bg-emerald-50/30 border-emerald-200" : "bg-amber-50/30 border-amber-200"}`}>
        <p className={`text-lg font-medium ${queued || allOk ? "text-emerald-800" : "text-amber-800"}`}>
          {queued ? "Envíos encolados" : allOk ? "Mensajes enviados" : "Envío completado con errores"}
        </p>
        {queued ? (
          <p className="mt-1 text-sm text-text-muted">
            {result.queued ?? 0} envío{(result.queued ?? 0) !== 1 ? "s" : ""} en cola · se procesan en segundo plano
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm text-text-muted">
              {result.sent} enviado{result.sent !== 1 ? "s" : ""} · {result.failed} error{result.failed !== 1 ? "es" : ""}
            </p>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <Stat label="Enviados" value={result.sent} color={allOk ? "text-emerald-700" : "text-amber-700"} />
              <Stat label="Procesados" value={result.total} />
              <Stat label="Errores" value={result.failed} color={result.failed > 0 ? "text-red-600" : "text-text-muted"} />
            </div>
          </>
        )}
        <p className="mt-3 text-xs text-text-muted">Plantilla: <code className="font-mono">{templateName}</code></p>
      </Card>

      {result.errors.length > 0 && (
        <Card className="overflow-hidden p-4">
          <h3 className="text-sm font-medium text-text-muted">Errores ({result.errors.length})</h3>
          <div className="mt-3 max-h-52 overflow-auto divide-y divide-border">
            {result.errors.map((e, i) => (
              <div key={i} className="flex gap-4 py-2 text-xs">
                <span className="w-28 shrink-0 font-mono text-text-muted">{e.rfc ?? e.employeeId}</span>
                <span className="text-red-600">{e.error}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="flex gap-3">
        <Button variant="secondary" onClick={onNewSend}>Nuevo envío</Button>
        <a href="/whatsapp/history"><Button variant="ghost">Ver historial</Button></a>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3 text-center">
      <p className={`text-2xl font-semibold ${color ?? "text-text-primary"}`}>{value}</p>
      <p className="text-xs text-text-muted">{label}</p>
    </div>
  );
}
