import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

// GET /api/whatsapp/bulk/history?page=1&pageSize=20&status=completed&mode=import&dateFrom=2024-01-01&dateTo=2024-12-31
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? "20")));
    const status = searchParams.get("status");   // completed | sending | failed | null (todos)
    const mode = searchParams.get("mode");        // import | manual | null (todos)
    const dateFrom = searchParams.get("dateFrom"); // ISO date string
    const dateTo = searchParams.get("dateTo");     // ISO date string

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
    if (dateFrom) query = query.gte("created_at", new Date(dateFrom).toISOString());
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
