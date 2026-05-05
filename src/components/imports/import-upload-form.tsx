"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
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
  const [result, setResult] = useState<ImportResult | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsUploading(true);
    setResult(null);

    const formData = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/imports", {
        method: "POST",
        body: formData,
      });

      const data = (await response.json()) as ImportResult;
      setResult(data);
      router.refresh();
    } catch (error) {
      setResult({
        error:
          error instanceof Error
            ? error.message
            : "No se pudo subir el archivo.",
      });
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <Card>
      <CardBody>
        <div className="mb-5">
          <h2 className="text-h2 font-semibold text-text-primary">
            Importar CSV
          </h2>
          <p className="mt-1 text-sm text-text-muted">
            Sube el archivo exportado desde Sheets o Excel. El sistema valida,
            guarda staging y permite aplicar cambios a empleados y ofertas.
          </p>
        </div>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-2 text-sm font-medium text-text-primary">
            Archivo CSV
            <input
              className="w-full rounded-base border border-border bg-surface px-3 py-2 text-sm text-text-primary file:mr-4 file:rounded-base file:border-0 file:bg-text-primary file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
              name="file"
              type="file"
              accept=".csv,text/csv"
              required
            />
          </label>

          <Button className="w-fit" disabled={isUploading} type="submit">
            {isUploading ? "Importando..." : "Subir y validar"}
          </Button>
        </form>

        {result ? <ImportResultPanel result={result} /> : null}
      </CardBody>
    </Card>
  );
}

function ImportResultPanel({ result }: { result: ImportResult }) {
  if (result.error) {
    return (
      <div className="mt-5 rounded-base border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        {result.error}
      </div>
    );
  }

  return (
    <div className="mt-5 rounded-base border border-primary/20 bg-primary/5 p-4 text-sm text-text-primary">
      <p className="font-semibold">Importacion registrada</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        <Metric
          label="Filas"
          value={result.summary?.totalRows ?? 0}
          tone="success"
        />
        <Metric
          label="Validas"
          value={result.summary?.validRows ?? 0}
          tone="success"
        />
        <Metric
          label="Invalidas"
          value={result.summary?.invalidRows ?? 0}
          tone="success"
        />
        <Metric
          label="Duplicadas"
          value={result.summary?.duplicateRows ?? 0}
          tone="success"
        />
      </div>

      {result.missingColumns && result.missingColumns.length > 0 ? (
        <div className="mt-4 rounded-base border border-link bg-link/20 p-3 text-text-primary">
          <p className="font-semibold">Columnas faltantes</p>
          <p className="mt-1">{result.missingColumns.join(", ")}</p>
        </div>
      ) : null}
    </div>
  );
}
