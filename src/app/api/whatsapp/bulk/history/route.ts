import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { BulkHistoryQuerySchema } from "@/lib/whatsapp/schemas";
import { parseQuery } from "@/lib/api/validation";
import { requireRole } from "@/lib/auth/roles";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

// GET /api/whatsapp/bulk/history?page=1&pageSize=20&status=completed&mode=import&dateFrom=2024-01-01&dateTo=2024-12-31
export async function GET(request: Request) {
  const auth = await requireRole("solo_lectura");
  if (!auth.ok) return auth.response;

  const parsed = parseQuery(request, BulkHistoryQuerySchema);
  if (!parsed.success) return parsed.response;
  const { page, pageSize, status, mode, dateFrom, dateTo } = parsed.data;

  try {
    const supabase = getSupabaseAdmin();
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from("whatsapp_bulk_sends")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (status) query = query.eq("status", status);
    if (mode) query = query.eq("mode", mode);
    if (dateFrom) query = query.gte("created_at", dateFrom.toISOString());
    if (dateTo) {
      // dateTo inclusivo: agregar 1 día
      const end = new Date(dateTo);
      end.setDate(end.getDate() + 1);
      query = query.lt("created_at", end.toISOString());
    }

    const { data, count, error } = await query;

    // PGRST103: requested range not satisfiable (página fuera de rango) — devolver página vacía
    if (error) {
      if ((error as { code?: string }).code === "PGRST103") {
        return NextResponse.json({
          ok: true,
          data: [],
          total: count ?? 0,
          page,
          pageSize,
          totalPages: Math.ceil((count ?? 0) / pageSize),
        });
      }
      throw error;
    }

    return NextResponse.json({
      ok: true,
      data: data ?? [],
      total: count ?? 0,
      page,
      pageSize,
      totalPages: Math.ceil((count ?? 0) / pageSize),
    });
  } catch (err) {
    logger.error("whatsapp.bulk_history.error", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Error inesperado." },
      { status: 500 },
    );
  }
}
