import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/roles";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

export async function GET() {
  // Métricas agregadas (sin PII por persona): basta un usuario aprovisionado.
  const auth = await requireRole("solo_lectura");
  if (!auth.ok) return auth.response;

  try {
    const supabase = getSupabaseAdmin();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [todayRes, deliveryRes, errorRes, recentRes] = await Promise.all([
      // Mensajes enviados hoy
      supabase
        .from("whatsapp_contract_messages")
        .select("id", { count: "exact", head: true })
        .gte("created_at", todayStart.toISOString()),

      // Total entregados (todos los tiempos)
      supabase
        .from("whatsapp_contract_messages")
        .select("id", { count: "exact", head: true })
        .eq("delivery_status", "delivered"),

      // Errores hoy
      supabase
        .from("whatsapp_contract_messages")
        .select("id", { count: "exact", head: true })
        .eq("delivery_status", "failed")
        .gte("created_at", todayStart.toISOString()),

      // Mensajes recientes (últimos 20)
      supabase
        .from("whatsapp_contract_messages")
        .select(
          "id, employee_id, message_type, delivery_status, created_at, error_message, employees!inner(nombre, apellidos, rfc)",
        )
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    const sentToday = todayRes.count ?? 0;
    const totalDelivered = deliveryRes.count ?? 0;
    const errorsToday = errorRes.count ?? 0;

    // Calcular tasa de entrega
    const [totalSentRes] = await Promise.all([
      supabase
        .from("whatsapp_contract_messages")
        .select("id", { count: "exact", head: true })
        .in("delivery_status", ["sent", "delivered", "read"]),
    ]);
    const totalSent = totalSentRes.count ?? 0;
    const deliveryRate = totalSent > 0 ? Math.round((totalDelivered / totalSent) * 100) : 0;

    return NextResponse.json({
      ok: true,
      stats: {
        sentToday,
        deliveryRate,
        errorsToday,
        totalDelivered,
      },
      recent: (recentRes.data ?? []).map((row) => {
        const emp = row.employees as unknown as { nombre: string | null; apellidos: string | null; rfc: string | null };
        return {
          id: row.id,
          employee_id: row.employee_id,
          nombre: emp?.nombre ?? null,
          apellidos: emp?.apellidos ?? null,
          rfc: emp?.rfc ?? null,
          message_type: row.message_type,
          delivery_status: row.delivery_status,
          created_at: row.created_at,
          error_message: row.error_message,
        };
      }),
    });
  } catch (err) {
    logger.error("whatsapp.stats.error", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Error inesperado." },
      { status: 500 },
    );
  }
}
