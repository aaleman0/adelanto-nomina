import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

/**
 * GET /api/whatsapp/employees/search?q=<term>&limit=10
 *
 * Busca empleados por nombre, apellidos, RFC o teléfono.
 * Devuelve datos básicos + oferta vigente para poder evaluar elegibilidad.
 * Usado en el flujo de prueba de envío individual.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "10", 10), 25);

  if (q.length < 2) {
    return NextResponse.json({ ok: true, employees: [] });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Buscar empleados por nombre, apellidos, RFC o teléfono
    const { data: employees, error } = await supabase
      .from("employees")
      .select("id, nombre, apellidos, rfc, telefono_normalizado, empleador")
      .or(
        [
          `nombre.ilike.%${q}%`,
          `apellidos.ilike.%${q}%`,
          `rfc.ilike.%${q}%`,
          `telefono_normalizado.ilike.%${q}%`,
        ].join(","),
      )
      .order("apellidos", { ascending: true })
      .limit(limit);

    if (error) throw error;

    if (!employees || employees.length === 0) {
      return NextResponse.json({ ok: true, employees: [] });
    }

    const ids = employees.map((e) => e.id);

    // Obtener oferta vigente para cada empleado encontrado
    const { data: offers } = await supabase
      .from("advance_offers")
      .select("employee_id, monto_prestamo_autorizado, is_eligible, status")
      .in("employee_id", ids)
      .eq("is_current", true);

    const offerMap = new Map((offers ?? []).map((o) => [o.employee_id, o]));

    const result = employees.map((emp) => {
      const offer = offerMap.get(emp.id);
      return {
        employee_id: emp.id,
        nombre: emp.nombre,
        apellidos: emp.apellidos,
        rfc: emp.rfc,
        telefono_normalizado: emp.telefono_normalizado,
        empleador: emp.empleador,
        monto_prestamo_autorizado: offer?.monto_prestamo_autorizado ?? null,
      };
    });

    return NextResponse.json({ ok: true, employees: result });
  } catch (err) {
    logger.error("whatsapp.employees.search.error", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Error inesperado." },
      { status: 500 },
    );
  }
}
