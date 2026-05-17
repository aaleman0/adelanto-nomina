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
  const [dragOver, setDragOver] = useState(false);

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
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary-light">
            <svg className="h-5 w-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <div>
            <h2 className="text-[16px] font-bold text-text-primary">Subir archivo CSV</h2>
            <p className="mt-0.5 text-[12px] text-text-muted">
              Sube un CSV exportado desde Sheets o Excel. El sistema validará los datos antes de aplicarlos.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardBody className="flex flex-col gap-5">
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          {/* Drop zone */}
          <label
            className={[
              "group relative flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-all duration-200",
              dragOver
                ? "border-primary bg-primary-light/60 scale-[1.01]"
                : fileName
                  ? "border-emerald-400 bg-emerald-50"
                  : "border-border hover:border-primary hover:bg-primary-light/30",
            ].join(" ")}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) setFileName(f.name);
            }}
          >
            {fileName ? (
              <>
                <div className="mb-3 grid h-12 w-12 place-items-center rounded-xl bg-emerald-100">
                  <svg className="h-6 w-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="font-bold text-emerald-700">{fileName}</p>
                <p className="mt-1 text-[12px] text-emerald-600/80">Archivo listo · haz clic para cambiar</p>
              </>
            ) : (
              <>
                <div className="mb-3 grid h-12 w-12 place-items-center rounded-xl bg-primary-light transition group-hover:bg-primary/20">
                  <svg className="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <p className="font-bold text-text-primary">
                  {dragOver ? "Suelta aquí tu archivo CSV" : "Arrastra o selecciona tu archivo CSV"}
                </p>
                <p className="mt-1 text-[12px] text-text-muted">
                  Formato .csv con encabezados de empleados y ofertas
                </p>
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

          {/* Requirements */}
          <div className="rounded-xl border border-border/60 bg-surface-muted/50 px-5 py-4">
            <p className="text-[12px] font-bold text-text-primary uppercase tracking-[0.1em]">Requisitos básicos</p>
            <ul className="mt-2.5 space-y-1.5">
              {[
                "Exportar desde Sheets o Excel como CSV.",
                "Conservar los encabezados esperados del archivo operativo.",
                "Corregir filas inválidas antes de aplicar cambios.",
              ].map((req) => (
                <li key={req} className="flex items-start gap-2 text-[12px] text-text-muted">
                  <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  {req}
                </li>
              ))}
            </ul>
          </div>

          <Button className="w-full sm:w-fit" disabled={isUploading} type="submit">
            {isUploading ? (
              <>
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Validando archivo...
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Subir y validar
              </>
            )}
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
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-xl bg-red-100">
            <svg className="h-4 w-4 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <p className="font-bold text-red-800">No se pudo validar el archivo</p>
        </div>
        <p className="mt-2 ml-10 text-[13px] text-red-700">{result.error}</p>
      </div>
    );
  }

  const invalidRows = result.summary?.invalidRows ?? 0;
  const isOk = invalidRows === 0;

  return (
    <div className={[
      "rounded-2xl border p-5",
      isOk ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50",
    ].join(" ")}>
      <div className="flex items-center gap-2.5">
        <div className={["grid h-8 w-8 place-items-center rounded-xl", isOk ? "bg-emerald-100" : "bg-amber-100"].join(" ")}>
          <svg
            className={["h-4 w-4", isOk ? "text-emerald-600" : "text-amber-600"].join(" ")}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            {isOk
              ? <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              : <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            }
          </svg>
        </div>
        <p className={["font-bold", isOk ? "text-emerald-800" : "text-amber-800"].join(" ")}>
          {isOk ? "Archivo validado correctamente" : "Validación con errores parciales"}
        </p>
      </div>
      <p className={["mt-2 ml-10 text-[12px]", isOk ? "text-emerald-700" : "text-amber-700"].join(" ")}>
        {isOk
          ? "Listo para aplicar. Revisa el resumen antes de continuar."
          : "Hay filas con errores. Corrige el CSV y vuelve a subirlo, o aplica solo las filas válidas si corresponde."}
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-white/80 bg-white/60 p-3 text-center">
          <Metric label="Total" value={result.summary?.totalRows ?? 0} />
        </div>
        <div className="rounded-xl border border-white/80 bg-white/60 p-3 text-center">
          <Metric label="Válidas" value={result.summary?.validRows ?? 0} tone="success" />
        </div>
        <div className="rounded-xl border border-white/80 bg-white/60 p-3 text-center">
          <Metric label="Inválidas" value={invalidRows} tone={invalidRows > 0 ? "warning" : "neutral"} />
        </div>
        <div className="rounded-xl border border-white/80 bg-white/60 p-3 text-center">
          <Metric label="Duplicados" value={result.summary?.duplicateRows ?? 0} />
        </div>
      </div>

      {result.missingColumns && result.missingColumns.length > 0 ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3">
          <p className="text-[12px] font-bold text-red-800">Columnas faltantes</p>
          <p className="mt-1 text-[12px] text-red-700">Agrega estas columnas al CSV: {result.missingColumns.join(", ")}</p>
        </div>
      ) : null}
    </div>
  );
}
