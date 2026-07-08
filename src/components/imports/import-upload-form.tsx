"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Metric } from "@/components/ui/metric";

type ImportResult = {
  batch?: {
    id: string;
    filename: string;
    status: string;
    total_rows: number;
    valid_rows: number;
    invalid_rows: number;
    duplicate_rows: number;
    created_at: string;
  };
  missingColumns?: string[];
  summary?: {
    totalRows: number;
    validRows: number;
    invalidRows: number;
    duplicateRows: number;
  };
  error?: string;
};

export function ImportUploadForm() {
  const router = useRouter();
  const [isUploading, setIsUploading] = useState(false);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsUploading(true);
    setResult(null);

    const formData = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/imports", { method: "POST", body: formData });
      const data = (await response.json()) as ImportResult;
      setResult(data);
      router.refresh();
    } catch (error) {
      setResult({
        error: error instanceof Error ? error.message : "No se pudo subir el archivo.",
      });
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <Card className="p-5">
      <h2 className="text-sm font-medium text-text-muted">Subir CSV</h2>
      <p className="text-sm text-text-muted">Exportado desde Sheets o Excel.</p>

      <form className="mt-4 flex flex-col gap-4" onSubmit={handleSubmit}>
        <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border px-6 py-8 text-center transition hover:border-primary hover:bg-surface-muted">
          {fileName ? (
            <>
              <p className="font-medium text-text-primary">{fileName}</p>
              <p className="text-xs text-text-muted">Haz clic para cambiar</p>
            </>
          ) : (
            <>
              <p className="font-medium text-text-primary">Selecciona tu archivo CSV</p>
              <p className="text-xs text-text-muted">O arrastra aquí</p>
            </>
          )}
          <input
            className="sr-only"
            name="file"
            type="file"
            accept=".csv,text/csv"
            required
            onChange={(event) => setFileName(event.target.files?.[0]?.name ?? "")}
          />
        </label>

        <Button className="w-full sm:w-fit" disabled={isUploading} type="submit">
          {isUploading ? "Validando..." : "Subir y validar"}
        </Button>
      </form>

      {result ? <ImportResultPanel result={result} /> : null}
    </Card>
  );
}

function ImportResultPanel({ result }: { result: ImportResult }) {
  if (result.error) {
    return (
      <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <p className="font-medium">No se pudo validar el archivo</p>
        <p className="mt-1 text-red-700">{result.error}</p>
      </div>
    );
  }

  const invalidRows = result.summary?.invalidRows ?? 0;
  const isOk = invalidRows === 0;

  return (
    <div className={["mt-4 rounded-xl border p-4", isOk ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"].join(" ")}>
      <p className={["text-sm font-medium", isOk ? "text-emerald-900" : "text-amber-900"].join(" ")}>
        {isOk ? "Archivo validado correctamente" : "Validación con errores parciales"}
      </p>
      <p className={["mt-1 text-sm", isOk ? "text-emerald-700" : "text-amber-700"].join(" ")}>
        {isOk
          ? "Listo para aplicar. Revisa el resumen antes de continuar."
          : "Corrige el CSV y vuelve a subirlo, o aplica solo las filas válidas."}
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <Metric label="Total" value={result.summary?.totalRows ?? 0} />
        <Metric label="Válidas" value={result.summary?.validRows ?? 0} tone="success" />
        <Metric label="Inválidas" value={invalidRows} tone={invalidRows > 0 ? "warning" : "neutral"} />
        <Metric label="Duplicados" value={result.summary?.duplicateRows ?? 0} />
      </div>

      {result.missingColumns && result.missingColumns.length > 0 ? (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
          <p className="font-medium text-red-800">Columnas faltantes</p>
          <p className="mt-1 text-red-700">{result.missingColumns.join(", ")}</p>
        </div>
      ) : null}
    </div>
  );
}
