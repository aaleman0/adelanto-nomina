import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { classifyPhone, type PhoneIssue } from "@/lib/whatsapp/phone-utils";

export const runtime = "nodejs";

export type PhoneAuditRow = {
  employee_id: string;
  nombre: string | null;
  apellidos: string | null;
  rfc: string | null;
  empleador: string | null;
  telefono_normalizado: string | null;
  issue: PhoneIssue;
  suggested_fix: string | null;
};

export type PhoneAuditResult = {
  total: number;
  ok: number;
  issues: number;
  by_issue: Record<PhoneIssue, number>;
  rows: PhoneAuditRow[];
};

/**
 * GET /api/whatsapp/phone-audit
 *
 * Audita todos los teléfonos de empleados en la DB y detecta
 * formatos que Meta rechazaría al intentar enviar por WhatsApp.
 */
export async function GET() {
  try {
    const supabase = getSupabaseAdmin();

    // Traer todos los empleados con sus datos básicos
    const { data: employees, error } = await supabase
      .from("employees")
      .select("id, nombre, apellidos, rfc, empleador, telefono_normalizado")
      .order("empleador", { ascending: true });

    if (error) throw error;

    const rows: PhoneAuditRow[] = (employees ?? []).map((emp) => {
      const { issue, suggested_fix } = classifyPhone(emp.telefono_normalizado);
      return {
        employee_id: emp.id,
        nombre: emp.nombre,
        apellidos: emp.apellidos,
        rfc: emp.rfc,
        empleador: emp.empleador,
        telefono_normalizado: emp.telefono_normalizado,
        issue,
        suggested_fix,
      };
    });

    const byIssue = rows.reduce(
      (acc, r) => {
        acc[r.issue] = (acc[r.issue] ?? 0) + 1;
        return acc;
      },
      {} as Record<PhoneIssue, number>,
    );

    const okCount = byIssue["ok"] ?? 0;
    const issueCount = rows.length - okCount;

    logger.info("whatsapp.phone_audit.done", {
      total: rows.length,
      ok: okCount,
      issues: issueCount,
    });

    return NextResponse.json({
      ok: true,
      total: rows.length,
      ok_count: okCount,
      issues: issueCount,
      by_issue: byIssue,
      rows,
    } satisfies { ok: boolean; total: number; ok_count: number; issues: number; by_issue: Record<PhoneIssue, number>; rows: PhoneAuditRow[] });
  } catch (err) {
    logger.error("whatsapp.phone_audit.error", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Error inesperado." },
      { status: 500 },
    );
  }
}
