import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * Datos para la vista de "Ciclos". Un ciclo = un lote de importación
 * (`import_batches`). Los empleados/montos de un ciclo se anclan por
 * `advance_offers.source_batch_id` (una oferta por empleado por lote).
 *
 * "Firmó" se determina por `contract_requests.status = 'firmado'`, NO por el
 * estado de la oferta: cuando un ciclo posterior reimporta al mismo empleado, su
 * oferta vieja pasa a `reemplazada`, pero la solicitud de contrato (y su firma)
 * persiste. Por eso el ancla confiable de "quién firmó en este ciclo" es la
 * `contract_request` ligada a la oferta de ese lote.
 */

export type CycleEstado = "firmado" | "en_proceso" | "sin_contrato";

export type CycleListRow = {
  batchId: string;
  label: string;
  appliedAt: string | null;
  total: number;
  firmados: number;
  montoFirmado: number;
};

export type CycleEmployeeRow = {
  employeeId: string;
  nombre: string;
  rfc: string;
  monto: number;
  estado: CycleEstado;
};

export type CycleDetail = {
  batchId: string;
  label: string;
  appliedAt: string | null;
  total: number;
  firmados: number;
  montoFirmado: number;
  employees: CycleEmployeeRow[];
};

// La forma en que PostgREST devuelve la solicitud embebida: como offer_id es
// UNIQUE en contract_requests, puede venir como objeto o como arreglo de uno.
type EmbeddedRequest = { status: string | null } | Array<{ status: string | null }> | null;

function requestStatus(embedded: EmbeddedRequest): string | null {
  if (!embedded) return null;
  const row = Array.isArray(embedded) ? embedded[0] : embedded;
  return row?.status ?? null;
}

function estadoFrom(reqStatus: string | null): CycleEstado {
  if (reqStatus === "firmado") return "firmado";
  // Solo los estados ACTIVOS cuentan como "en proceso". Una solicitud `error` o
  // `reemplazada` (contrato de un ciclo superado por otro) no está en proceso.
  if (reqStatus === "recibida" || reqStatus === "generando" || reqStatus === "link_generado") {
    return "en_proceso";
  }
  return "sin_contrato";
}

type EmbeddedEmployee =
  | { nombre: string | null; apellido_paterno: string | null; apellido_materno: string | null; rfc: string | null }
  | Array<{ nombre: string | null; apellido_paterno: string | null; apellido_materno: string | null; rfc: string | null }>
  | null;

function employeeOf(embedded: EmbeddedEmployee) {
  const e = Array.isArray(embedded) ? embedded[0] : embedded;
  const nombre = [e?.nombre, e?.apellido_paterno, e?.apellido_materno].filter(Boolean).join(" ").trim();
  return { nombre: nombre || "Sin nombre", rfc: e?.rfc ?? "" };
}

/** Lista de ciclos (lotes aplicados) con su avance: total y firmados. */
export async function getCycleListData(): Promise<{ rows: CycleListRow[] }> {
  const supabase = getSupabaseAdmin();

  const { data: batches, error: batchErr } = await supabase
    .from("import_batches")
    .select("id, filename, applied_at, created_at")
    .eq("status", "aplicada")
    .order("applied_at", { ascending: false, nullsFirst: false })
    .limit(50);
  if (batchErr) throw batchErr;

  const batchIds = (batches ?? []).map((b) => b.id as string);
  if (batchIds.length === 0) return { rows: [] };

  // Todas las ofertas de esos lotes + el estado de su solicitud de contrato, en
  // una sola consulta; se agregan por lote en memoria.
  const { data: offers, error: offErr } = await supabase
    .from("advance_offers")
    .select("source_batch_id, monto_prestamo_autorizado, contract_requests(status)")
    .in("source_batch_id", batchIds);
  if (offErr) throw offErr;

  type Agg = { total: number; firmados: number; montoFirmado: number };
  const byBatch = new Map<string, Agg>();
  for (const o of offers ?? []) {
    const bid = o.source_batch_id as string;
    const agg = byBatch.get(bid) ?? { total: 0, firmados: 0, montoFirmado: 0 };
    agg.total += 1;
    if (requestStatus(o.contract_requests as EmbeddedRequest) === "firmado") {
      agg.firmados += 1;
      agg.montoFirmado += Number(o.monto_prestamo_autorizado ?? 0);
    }
    byBatch.set(bid, agg);
  }

  const rows: CycleListRow[] = (batches ?? []).map((b) => {
    const agg = byBatch.get(b.id as string) ?? { total: 0, firmados: 0, montoFirmado: 0 };
    return {
      batchId: b.id as string,
      label: (b.filename as string) || "Ciclo",
      appliedAt: (b.applied_at as string | null) ?? (b.created_at as string | null),
      total: agg.total,
      firmados: agg.firmados,
      montoFirmado: agg.montoFirmado,
    };
  });

  return { rows };
}

/** Detalle de un ciclo: cabecera + empleados con su monto y estado de firma. */
export async function getCycleDetailData(batchId: string): Promise<CycleDetail | null> {
  const supabase = getSupabaseAdmin();

  const { data: batch, error: batchErr } = await supabase
    .from("import_batches")
    .select("id, filename, applied_at, created_at, status")
    .eq("id", batchId)
    .maybeSingle();
  if (batchErr) throw batchErr;
  if (!batch) return null;

  const { data: offers, error: offErr } = await supabase
    .from("advance_offers")
    .select(
      "employee_id, monto_prestamo_autorizado, employees!inner(nombre, apellido_paterno, apellido_materno, rfc), contract_requests(status)",
    )
    .eq("source_batch_id", batchId);
  if (offErr) throw offErr;

  const employees: CycleEmployeeRow[] = (offers ?? []).map((o) => {
    const { nombre, rfc } = employeeOf(o.employees as EmbeddedEmployee);
    const estado = estadoFrom(requestStatus(o.contract_requests as EmbeddedRequest));
    return {
      employeeId: o.employee_id as string,
      nombre,
      rfc,
      monto: Number(o.monto_prestamo_autorizado ?? 0),
      estado,
    };
  });
  // Firmados primero, luego en proceso, luego sin contrato; por nombre dentro de cada grupo.
  const orden: Record<CycleEstado, number> = { firmado: 0, en_proceso: 1, sin_contrato: 2 };
  employees.sort((a, b) => orden[a.estado] - orden[b.estado] || a.nombre.localeCompare(b.nombre));

  const firmadosRows = employees.filter((e) => e.estado === "firmado");

  return {
    batchId: batch.id as string,
    label: (batch.filename as string) || "Ciclo",
    appliedAt: (batch.applied_at as string | null) ?? (batch.created_at as string | null),
    total: employees.length,
    firmados: firmadosRows.length,
    montoFirmado: firmadosRows.reduce((sum, e) => sum + e.monto, 0),
    employees,
  };
}
