"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { SendMode } from "./types";

type Props = {
  selectedCount: number;
  templateName: string;
  mode: SendMode;
  importFilename?: string | null;
  sending: boolean;
  error: string | null;
  onConfirm: () => void;
  onBack: () => void;
};

export function SendConfirmation({
  selectedCount,
  templateName,
  mode,
  importFilename,
  sending,
  error,
  onConfirm,
  onBack,
}: Props) {
  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4">
        <p className="text-sm font-medium text-text-primary">
          Enviar a <span className="text-primary">{selectedCount} empleado{selectedCount !== 1 ? "s" : ""}</span>
        </p>
        <div className="mt-3 divide-y divide-border rounded-lg border border-border">
          <SummaryRow label="Plantilla" value={templateName} />
          <SummaryRow label="Fuente" value={mode === "import" ? (importFilename ?? "Importación") : "Manual"} />
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="mt-4 flex items-center justify-between gap-3">
          <Button variant="ghost" disabled={sending} onClick={onBack}>Volver</Button>
          <Button disabled={sending || selectedCount === 0} onClick={onConfirm}>
            {sending ? "Enviando..." : "Enviar mensajes"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
      <span className="text-text-muted">{label}</span>
      <span className="font-medium text-text-primary">{value}</span>
    </div>
  );
}
