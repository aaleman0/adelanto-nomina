"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useHasRole } from "@/components/auth/role-context";
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
  // El envío masivo exige rol operaciones. El backend lo bloquea igual; aquí se
  // deshabilita para no llevar al usuario hasta el final de un flujo de cuatro
  // pasos y estrellarlo contra un 403.
  const canSend = useHasRole("operaciones");

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
          <div className="note note-danger mt-4 py-1 text-sm text-danger">
            {error}
          </div>
        )}

        {!canSend && (
          <div className="note note-warning mt-4 py-1 text-sm text-warning">
            Tu rol no permite enviar mensajes. Necesitas el rol de operaciones.
          </div>
        )}

        <div className="mt-4 flex items-center justify-between gap-3">
          <Button variant="ghost" disabled={sending} onClick={onBack}>Volver</Button>
          <Button
            disabled={sending || selectedCount === 0 || !canSend}
            onClick={onConfirm}
            title={canSend ? undefined : "Requiere rol operaciones."}
          >
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
