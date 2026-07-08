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
    if (!window.confirm("Aplicar las filas válidas a empleados y ofertas.")) return;

    setIsApplying(true);
    setResult(null);

    try {
      const response = await fetch(`/api/imports/${batchId}/apply`, { method: "POST" });
      const data = (await response.json()) as ApplyResult;
      setResult(data);
      router.refresh();
    } catch (error) {
      setResult({
        error: error instanceof Error ? error.message : "No se pudo aplicar la importación.",
      });
    } finally {
      setIsApplying(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <Button
        className="h-8 px-2.5 text-xs"
        disabled={isApplying}
        onClick={applyImport}
        type="button"
      >
        {isApplying ? "Aplicando..." : "Aplicar"}
      </Button>
      {result?.error ? <p className="text-xs text-red-600">{result.error}</p> : null}
      {result && !result.error ? (
        <p className="text-xs text-text-muted">{result.changedRows ?? 0} cambios · {result.unchangedRows ?? 0} sin cambios</p>
      ) : null}
    </div>
  );
}
