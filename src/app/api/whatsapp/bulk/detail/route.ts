import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/roles";
import { BulkDetailQuerySchema } from "@/lib/whatsapp/schemas";
import { parseQuery } from "@/lib/api/validation";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

// GET /api/whatsapp/bulk/detail?id=<bulkSendId>&page=1&pageSize=50
export async function GET(request: Request) {
  const auth = await requireRole("solo_lectura");
  if (!auth.ok) return auth.response;

  const parsed = parseQuery(request, BulkDetailQuerySchema);
  if (!parsed.success) return parsed.response;
  const { id, page, pageSize, status: statusFilter, q: searchQuery } = parsed.data;

  try {
    const supabase = getSupabaseAdmin();

    // Bulk send header
    const { data: bulkSend, error: bulkError } = await supabase
      .from("whatsapp_bulk_sends")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (bulkError) throw bulkError;
    if (!bulkSend) {
      return NextResponse.json({ ok: false, error: "Envío masivo no encontrado." }, { status: 404 });
    }

    // Messages for this bulk send
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let msgQuery = supabase
      .from("whatsapp_contract_messages")
      .select(
        "id, employee_id, delivery_status, status, error_message, created_at, wa_message_id, employees!inner(nombre, apellidos, rfc, telefono_normalizado)",
        { count: "exact" },
      )
      .eq("bulk_send_id", id)
      .order("created_at", { ascending: true })
      .range(from, to);

    if (statusFilter) {
      msgQuery = msgQuery.eq("delivery_status", statusFilter);
    }

    // Búsqueda por RFC en la tabla de employees relacionada
    if (searchQuery) {
      msgQuery = msgQuery.ilike("employees.rfc", `%${searchQuery}%`);
    }

    const { data: messages, count, error: msgError } = await msgQuery;

    if (msgError) {
      // PGRST103: rango fuera de límites (página más allá de los datos). Igual
      // que bulk/history, devolver una página vacía en vez de un 500.
      if ((msgError as { code?: string }).code === "PGRST103") {
        return NextResponse.json({
          ok: true,
          bulkSend,
          messages: [],
          total: 0,
          page,
          pageSize,
          totalPages: 0,
        });
      }
      throw msgError;
    }

    // Log para diagnóstico: verificar consistencia entre bulk_send y messages
    if (bulkSend.sent_count > 0 && (!messages || messages.length === 0)) {
      logger.error("whatsapp.bulk_detail.inconsistent_data", {
        bulkSendId: id,
        sent_count: bulkSend.sent_count,
        failed_count: bulkSend.failed_count,
        messages_count: messages?.length ?? 0,
        statusFilter,
        searchQuery,
      });
    }

    // Log informativo con datos de la consulta
    logger.info("whatsapp.bulk_detail.query", {
      bulkSendId: id,
      sent_count: bulkSend.sent_count,
      failed_count: bulkSend.failed_count,
      messages_returned: messages?.length ?? 0,
      total_count: count,
      page,
      pageSize,
      statusFilter,
      searchQuery,
    });

    return NextResponse.json({
      ok: true,
      bulkSend,
      messages: (messages ?? []).map((m) => {
        const emp = m.employees as unknown as {
          nombre: string | null;
          apellidos: string | null;
          rfc: string | null;
          telefono_normalizado: string | null;
        };
        return {
          id: m.id,
          employee_id: m.employee_id,
          nombre: emp?.nombre ?? null,
          apellidos: emp?.apellidos ?? null,
          rfc: emp?.rfc ?? null,
          telefono: emp?.telefono_normalizado ?? null, // Devolver telefono_normalizado como telefono
          delivery_status: m.delivery_status,
          status: m.status,
          error_message: m.error_message,
          created_at: m.created_at,
          wa_message_id: m.wa_message_id,
        };
      }),
      total: count ?? 0,
      page,
      pageSize,
      totalPages: Math.ceil((count ?? 0) / pageSize),
    });
  } catch (err) {
    logger.error("whatsapp.bulk_detail.error", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Error inesperado." },
      { status: 500 },
    );
  }
}
