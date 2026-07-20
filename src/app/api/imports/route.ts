import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/roles";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { RATE_LIMITS } from "@/lib/security/rate-limit-config";
import { prepareCsvImport } from "@/lib/imports/csv";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, RATE_LIMITS.importUpload);
  if (limited) return limited;

  const auth = await requireRole("operaciones");
  if (!auth.ok) return auth.response;

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Sube un archivo CSV en el campo file." },
        { status: 400 },
      );
    }

    if (!file.name.toLowerCase().endsWith(".csv")) {
      return NextResponse.json(
        { error: "Por ahora solo aceptamos archivos .csv." },
        { status: 400 },
      );
    }

    const csvText = await file.text();
    const preparedImport = prepareCsvImport(csvText);
    const supabase = getSupabaseAdmin();
    const importId = randomUUID();
    const storagePath = `${importId}/${safeFilename(file.name)}`;
    const batchStatus =
      preparedImport.missingColumns.length > 0
        ? "fallida"
        : preparedImport.summary.invalidRows > 0 ||
            preparedImport.summary.duplicateRows > 0
          ? "aplicada_con_errores"
          : "validando";

    const uploadResult = await supabase.storage
      .from("imports")
      .upload(storagePath, file, {
        contentType: file.type || "text/csv",
        upsert: false,
      });

    if (uploadResult.error) {
      throw uploadResult.error;
    }

    const batchInsert = await supabase
      .from("import_batches")
      .insert({
        id: importId,
        filename: file.name,
        storage_bucket: "imports",
        storage_path: storagePath,
        status: batchStatus,
        total_rows: preparedImport.summary.totalRows,
        valid_rows: preparedImport.summary.validRows,
        invalid_rows: preparedImport.summary.invalidRows,
        duplicate_rows: preparedImport.summary.duplicateRows,
        unchanged_rows: 0,
        changed_rows: 0,
        applied_rows: 0,
        error_summary: {
          missing_columns: preparedImport.missingColumns,
        },
        metadata: {
          file_size: file.size,
          content_type: file.type || "text/csv",
        },
      })
      .select("id, filename, status, total_rows, valid_rows, invalid_rows, duplicate_rows, created_at")
      .single();

    if (batchInsert.error) {
      throw batchInsert.error;
    }

    if (preparedImport.rows.length > 0 && preparedImport.missingColumns.length === 0) {
      const rowsInsert = await supabase.from("raw_import_rows").insert(
        preparedImport.rows.map((row) => ({
          batch_id: importId,
          row_number: row.row_number,
          raw_payload: row.raw_payload,
          normalized_payload: row.normalized_payload,
          row_hash: row.row_hash,
          rfc: row.rfc,
          telefono_normalizado: row.telefono_normalizado,
          clabe_last4: row.clabe_last4,
          status: row.status,
          errors: row.errors,
          warnings: row.warnings,
        })),
      );

      if (rowsInsert.error) {
        throw rowsInsert.error;
      }
    }

    return NextResponse.json({
      batch: batchInsert.data,
      missingColumns: preparedImport.missingColumns,
      summary: preparedImport.summary,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo importar el CSV.",
      },
      { status: 500 },
    );
  }
}

function safeFilename(filename: string) {
  return filename
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}
