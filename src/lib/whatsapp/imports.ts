import { getSupabaseAdmin } from "@/lib/supabase/server";

export type RecentImport = {
  id: string;
  original_filename: string | null;
  row_count: number | null;
  applied_at: string | null;
  status: string | null;
};

export type ImportEmployee = {
  employee_id: string;
  nombre: string | null;
  apellidos: string | null;
  rfc: string | null;
  telefono_normalizado: string | null;
  empleador: string | null;
  monto_prestamo_autorizado: number | null;
};

export async function getRecentImports(limit = 10): Promise<RecentImport[]> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("imports")
    .select("id, original_filename, row_count, applied_at, status")
    .eq("status", "applied")
    .order("applied_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data ?? []) as RecentImport[];
}

export async function getEmployeesFromImport(importId: string): Promise<ImportEmployee[]> {
  const supabase = getSupabaseAdmin();

  // Los employees de una importación están vinculados via advance_offers.source_batch_id
  const { data, error } = await supabase
    .from("advance_offers")
    .select(
      "employee_id, monto_prestamo_autorizado, employees!inner(nombre, apellidos, rfc, telefono_normalizado, empleador)",
    )
    .eq("source_batch_id", importId)
    .eq("is_current", true);

  if (error) throw error;

  return (data ?? []).map((row) => {
    const emp = row.employees as unknown as {
      nombre: string | null;
      apellidos: string | null;
      rfc: string | null;
      telefono_normalizado: string | null;
      empleador: string | null;
    };
    return {
      employee_id: row.employee_id,
      nombre: emp.nombre,
      apellidos: emp.apellidos,
      rfc: emp.rfc,
      telefono_normalizado: emp.telefono_normalizado,
      empleador: emp.empleador,
      monto_prestamo_autorizado: row.monto_prestamo_autorizado,
    };
  });
}
