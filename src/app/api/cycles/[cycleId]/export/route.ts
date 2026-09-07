import { requireRole } from "@/lib/auth/roles";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { calculateLoanTotals } from "@/lib/contracts/loan-totals";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

/**
 * Exporta en CSV (que Excel abre directo) los EMPLEADOS QUE FIRMARON en un ciclo
 * (lote de importación), con nombre + RFC + los dos montos: el AUTORIZADO (lo que
 * recibe la persona) y el TOTAL A PAGAR (con comisión e IVA, lo que se le
 * descuenta de la nómina). Son cifras distintas y ambas se necesitan: una para
 * dispersar y otra para el descuento. "Firmó" = la solicitud de
 * contrato de su oferta de ese lote está `firmado` (persiste aunque un ciclo
 * posterior reemplace la oferta). Rol `operaciones`.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ cycleId: string }> }) {
  const { cycleId } = await params;

  const auth = await requireRole("operaciones");
  if (!auth.ok) return auth.response;

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("advance_offers")
      .select(
        "monto_prestamo_autorizado, employees!inner(nombre, apellido_paterno, apellido_materno, rfc), contract_requests!inner(status)",
      )
      .eq("source_batch_id", cycleId)
      .eq("contract_requests.status", "firmado");

    if (error) throw error;

    const rows = (data ?? []).map((o) => {
      const raw = o.employees as
        | { nombre?: string | null; apellido_paterno?: string | null; apellido_materno?: string | null; rfc?: string | null }
        | Array<{ nombre?: string | null; apellido_paterno?: string | null; apellido_materno?: string | null; rfc?: string | null }>
        | null;
      const e = Array.isArray(raw) ? raw[0] : raw;
      const nombre = [e?.nombre, e?.apellido_paterno, e?.apellido_materno].filter(Boolean).join(" ").trim();
      return {
        nombre: nombre || "Sin nombre",
        rfc: e?.rfc ?? "",
        monto: Number(o.monto_prestamo_autorizado ?? 0),
        // Se calcula con la MISMA función que llena el contrato, para que el
        // Excel y el pagaré que firmó la persona no puedan discrepar.
        total: calculateLoanTotals(Number(o.monto_prestamo_autorizado ?? 0)).total,
      };
    });
    rows.sort((a, b) => a.nombre.localeCompare(b.nombre));

    const lines = ["Nombre,RFC,Monto autorizado,Total a pagar"];
    for (const r of rows) {
      lines.push(
        [csvEscape(r.nombre), csvEscape(r.rfc), r.monto.toFixed(2), r.total.toFixed(2)].join(","),
      );
    }
    // BOM para que Excel respete acentos; CRLF entre filas.
    const csv = "﻿" + lines.join("\r\n") + "\r\n";

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="firmados-${cycleId.slice(0, 8)}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    logger.error("cycles.export.error", err instanceof Error ? err : new Error(String(err)), { cycleId });
    return new Response("No se pudo generar el archivo.", { status: 500 });
  }
}

function csvEscape(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
