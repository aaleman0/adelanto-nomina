"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
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
    <Card className="overflow-hidden">
      <CardHeader>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Paso 1</p>
        <h2 className="mt-1 text-h2 font-semibold text-text-primary">Subir archivo CSV</h2>
        <p className="mt-1 text-sm text-text-muted">
          Sube un CSV exportado desde Sheets o Excel. El sistema validará los datos antes de aplicarlos.
        </p>
      </CardHeader>
      <CardBody className="flex flex-col gap-5">
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <label className="group flex cursor-pointer flex-col items-center justify-center rounded-base border border-dashed border-border bg-surface-muted px-5 py-8 text-center transition hover:border-primary hover:bg-primary/5">
            <span className="text-sm font-semibold text-text-primary">
              {fileName || "Selecciona o arrastra tu archivo CSV"}
            </span>
            <span className="mt-1 text-xs text-text-muted">Formato .csv, con encabezados de empleados y ofertas.</span>
            <input
              className="sr-only"
              name="file"
              type="file"
              accept=".csv,text/csv"
              required
              onChange={(event) => setFileName(event.target.files?.[0]?.name ?? "")}
            />
          </label>

          <div className="rounded-base border border-border bg-surface px-4 py-3 text-sm text-text-muted">
            <p className="font-semibold text-text-primary">Requisitos básicos</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Exportar desde Sheets o Excel como CSV.</li>
              <li>Conservar los encabezados esperados del archivo operativo.</li>
              <li>Corregir filas inválidas antes de aplicar cambios.</li>
            </ul>
          </div>

          <Button className="w-full sm:w-fit" disabled={isUploading} type="submit">
            {isUploading ? "Validando archivo..." : "Subir y validar"}
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
      <div className="rounded-base border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <p className="font-semibold">No se pudo validar el archivo</p>
        <p className="mt-1">{result.error}</p>
      </div>
    );
  }

  const invalidRows = result.summary?.invalidRows ?? 0;

  return (
    <div className="rounded-base border border-primary/20 bg-primary/5 p-4 text-sm text-text-primary">
      <p className="font-semibold">
        {invalidRows > 0 ? "Validación con errores parciales" : "Archivo validado correctamente"}
      </p>
      <p className="mt-1 text-text-muted">
        {invalidRows > 0
          ? "Hay filas con errores. Corrige el CSV y vuelve a subirlo, o aplica solo las filas válidas si corresponde."
          : "Listo para aplicar. Revisa el resumen antes de continuar."}
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <Metric label="Total de filas" value={result.summary?.totalRows ?? 0} />
        <Metric label="Filas válidas" value={result.summary?.validRows ?? 0} tone="success" />
        <Metric label="Filas inválidas" value={invalidRows} tone={invalidRows > 0 ? "warning" : "neutral"} />
        <Metric label="Duplicados" value={result.summary?.duplicateRows ?? 0} />
      </div>

      {result.missingColumns && result.missingColumns.length > 0 ? (
        <div className="mt-4 rounded-base border border-link bg-link/20 p-3 text-text-primary">
          <p className="font-semibold">Columnas faltantes</p>
          <p className="mt-1">Agrega estas columnas al CSV: {result.missingColumns.join(", ")}</p>
        </div>
      ) : null}
    </div>
  );
}
