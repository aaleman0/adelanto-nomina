import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

type FixEntry = {
  employee_id: string;
  telefono_normalizado: string;
};

/**
 * POST /api/whatsapp/phone-audit/fix
 *
 * Aplica correcciones automáticas de teléfono a los empleados indicados.
 * Solo acepta correcciones sugeridas por el auditor (no permite valores arbitrarios).
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const fixes: FixEntry[] = body?.fixes ?? [];

    if (!Array.isArray(fixes) || fixes.length === 0) {
      return NextResponse.json({ ok: false, error: "No se enviaron correcciones." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    let fixed = 0;
    let errors = 0;

    for (const fix of fixes) {
      if (!fix.employee_id || !fix.telefono_normalizado) {
        errors += 1;
        continue;
      }

      // Validar que el valor propuesto tiene un formato razonable (solo dígitos, 10–15 chars)
      const digits = fix.telefono_normalizado.replace(/\D/g, "");
      if (digits.length < 10 || digits.length > 15) {
        logger.warn("whatsapp.phone_audit.fix.invalid", {
          employee_id: fix.employee_id,
          proposed: fix.telefono_normalizado,
        });
        errors += 1;
        continue;
      }

      const { error } = await supabase
        .from("employees")
        .update({ telefono_normalizado: digits })
        .eq("id", fix.employee_id);

      if (error) {
        logger.error("whatsapp.phone_audit.fix.error", error, { employee_id: fix.employee_id });
        errors += 1;
      } else {
        fixed += 1;
        logger.info("whatsapp.phone_audit.fix.applied", {
          employee_id: fix.employee_id,
          telefono_normalizado: digits,
        });
      }
    }

    // Registro de auditoría global
    if (fixed > 0) {
      await supabase.from("audit_events").insert({
        event_name: "phone_audit.bulk_fix",
        entity_type: "employees",
        entity_id: "bulk",
        source: "backend",
        summary: `Corrección masiva de teléfonos: ${fixed} corregido${fixed !== 1 ? "s" : ""}, ${errors} error${errors !== 1 ? "es" : ""}.`,
        metadata: { fixed, errors, employee_ids: fixes.map((f) => f.employee_id) },
        actor_type: "operator",
      });
    }

    return NextResponse.json({ ok: true, fixed, errors });
  } catch (err) {
    logger.error("whatsapp.phone_audit.fix.fatal", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Error inesperado." },
      { status: 500 },
    );
  }
}
