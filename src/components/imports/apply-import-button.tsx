"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

type ApplyResult = {
  status?: string;
  appliedRows?: number;
  changedRows?: number;
  unchangedRows?: number;
  error?: string;
};

export function ApplyImportButton({ batchId }: { batchId: string }) {
  const router = useRouter();
  const [isApplying, setIsApplying] = useState(false);
  const [result, setResult] = useState<ApplyResult | null>(null);

  async function applyImport() {
    if (!window.confirm("Esto aplicará las filas válidas a empleados y ofertas. ¿Deseas continuar?")) {
      return;
    }

    setIsApplying(true);
    setResult(null);

    try {
      const response = await fetch(`/api/imports/${batchId}/apply`, {
        method: "POST",
      });
      const data = (await response.json()) as ApplyResult;
      setResult(data);
      router.refresh();
    } catch (error) {
      setResult({
        error:
          error instanceof Error
            ? error.message
            : "No se pudo aplicar la importacion.",
      });
    } finally {
      setIsApplying(false);
    }
  }

  return (
    <div className="flex min-w-36 flex-col gap-2">
      <Button
        className="h-9 px-3 text-xs"
        disabled={isApplying}
        onClick={applyImport}
        type="button"
      >
        {isApplying ? "Aplicando..." : "Aplicar filas válidas"}
      </Button>
      {result?.error ? <p className="text-xs text-red-700">{result.error}</p> : null}
      {result && !result.error ? (
        <p className="text-xs text-primary">Importación aplicada: {result.changedRows ?? 0} cambios, {result.unchangedRows ?? 0} sin cambios.</p>
      ) : null}
    </div>
  );
}
