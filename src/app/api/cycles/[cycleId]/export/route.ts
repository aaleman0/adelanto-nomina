import ExcelJS from "exceljs";
import { requireRole } from "@/lib/auth/roles";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { calculateLoanTotals } from "@/lib/contracts/loan-totals";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

/**
 * Exporta en Excel los EMPLEADOS QUE FIRMARON en un ciclo (lote de importación),
 * con nombre, RFC y los dos montos: el AUTORIZADO (lo que recibe la persona) y
 * el TOTAL A PAGAR (con comisión e IVA, lo que se le descuenta de nómina). Son
 * cifras distintas y ambas se necesitan: una para dispersar, otra para el
 * descuento.
 *
 * "Firmó" = la solicitud de contrato de su oferta de ese lote está `firmado`
 * (persiste aunque un ciclo posterior reemplace la oferta). Rol `operaciones`.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ cycleId: string }> }) {
  const { cycleId } = await params;

  const auth = await requireRole("operaciones");
  if (!auth.ok) return auth.response;

  try {
    const supabase = getSupabaseAdmin();

    const [{ data, error }, { data: lote }] = await Promise.all([
      supabase
        .from("advance_offers")
        .select(
          "monto_prestamo_autorizado, employees!inner(nombre, apellido_paterno, apellido_materno, rfc), contract_requests!inner(status)",
        )
        .eq("source_batch_id", cycleId)
        .eq("contract_requests.status", "firmado"),
      supabase.from("import_batches").select("filename").eq("id", cycleId).maybeSingle(),
    ]);

    if (error) throw error;

    const rows = (data ?? []).map((o) => {
      const raw = o.employees as
        | { nombre?: string | null; apellido_paterno?: string | null; apellido_materno?: string | null; rfc?: string | null }
        | Array<{ nombre?: string | null; apellido_paterno?: string | null; apellido_materno?: string | null; rfc?: string | null }>
        | null;
      const e = Array.isArray(raw) ? raw[0] : raw;
      const nombre = [e?.nombre, e?.apellido_paterno, e?.apellido_materno].filter(Boolean).join(" ").trim();
      const monto = Number(o.monto_prestamo_autorizado ?? 0);
      return {
        nombre: nombre || "Sin nombre",
        rfc: e?.rfc ?? "",
        monto,
        // Se calcula con la MISMA función que llena el contrato, para que el
        // Excel y el pagaré que firmó la persona no puedan discrepar.
        total: calculateLoanTotals(monto).total,
      };
    });
    rows.sort((a, b) => a.nombre.localeCompare(b.nombre));

    const libro = new ExcelJS.Workbook();
    const hoja = libro.addWorksheet("Firmados");
    hoja.columns = [
      { header: "Nombre", key: "nombre", width: 38 },
      { header: "RFC", key: "rfc", width: 16 },
      { header: "Monto autorizado", key: "monto", width: 18 },
      { header: "Total a pagar", key: "total", width: 16 },
    ];
    hoja.getRow(1).font = { bold: true };
    hoja.addRows(rows);

    // Formato de moneda: quien abra el archivo ve $4,000.00, no 4000. Se guardan
    // como NÚMERO (no texto) para que se puedan sumar en la misma hoja.
    // Se direccionan por ÍNDICE: `getColumn` interpreta una cadena como letra de
    // columna ("A", "B"…), no como la clave, y revienta con "Out of bounds".
    for (const indice of [3, 4]) {
      hoja.getColumn(indice).numFmt = '"$"#,##0.00';
      hoja.getColumn(indice).alignment = { horizontal: "right" };
    }

    const buffer = await libro.xlsx.writeBuffer();

    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${nombreDeArchivo(lote?.filename ?? null, cycleId)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    logger.error("cycles.export_error", err, { cycleId });
    return new Response(
      JSON.stringify({ error: "No se pudo generar el archivo. Inténtalo de nuevo." }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}

/**
 * El archivo hereda el nombre del que se importó, con "firmados" al final: así
 * el operador sabe de un vistazo a qué carga corresponde cuando tiene varios
 * ciclos descargados. Se quita la extensión original (era .csv o .xlsx) y se
 * limpian los caracteres que rompen una cabecera HTTP o un nombre de archivo.
 */
export function nombreDeArchivo(filenameDelLote: string | null, cycleId: string): string {
  const base = (filenameDelLote ?? "")
    .replace(/\.[^.]+$/, "")
    .replace(/["\\\r\n]/g, "")
    .trim();
  return base ? `${base} - firmados.xlsx` : `firmados-${cycleId.slice(0, 8)}.xlsx`;
}
