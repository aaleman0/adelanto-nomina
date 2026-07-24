import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { PhoneAuditFixBodySchema, PhoneFixEntrySchema } from "@/lib/whatsapp/schemas";
import { parseJsonBody } from "@/lib/api/validation";
import { requireRole } from "@/lib/auth/roles";
import { recordAuditEvent } from "@/lib/audit";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

/**
 * POST /api/whatsapp/phone-audit/fix
 *
 * Aplica correcciones de teléfono a los empleados indicados.
 *
 * El sobre se valida con Zod; cada entrada se valida por separado para que una
 * corrección inválida no invalide el lote completo. El teléfono llega ya
 * normalizado a dígitos por el esquema.
 */
export async function POST(request: Request) {
  const auth = await requireRole("admin");
  if (!auth.ok) return auth.response;

  const parsed = await parseJsonBody(request, PhoneAuditFixBodySchema);
  if (!parsed.success) return parsed.response;
  const { fixes } = parsed.data;

  try {
    const supabase = getSupabaseAdmin();
    let fixed = 0;
    let errors = 0;
    const appliedEmployeeIds: string[] = [];

    for (const rawFix of fixes) {
      const entry = PhoneFixEntrySchema.safeParse(rawFix);

      if (!entry.success) {
        logger.warn("whatsapp.phone_audit.fix.invalid", {
          issues: entry.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
        });
        errors += 1;
        continue;
      }

      const { employee_id, telefono_normalizado } = entry.data;

      const { error } = await supabase
        .from("employees")
        .update({ telefono_normalizado })
        .eq("id", employee_id);

      if (error) {
        logger.error("whatsapp.phone_audit.fix.error", error, { employee_id });
        errors += 1;
        continue;
      }

      fixed += 1;
      appliedEmployeeIds.push(employee_id);
      logger.info("whatsapp.phone_audit.fix.applied", { employee_id, telefono_normalizado });
    }

    if (fixed > 0) {
      // `entity_id` es uuid: antes se insertaba la cadena "bulk", lo que hacía
      // fallar el insert en silencio y dejaba la corrección sin rastro. Ahora
      // va null y el detalle en metadata, con el operador que la ejecutó.
      try {
        await recordAuditEvent({
          eventName: "phone_audit.bulk_fix",
          entityType: "employees",
          entityId: null,
          source: "backoffice",
          summary: `Corrección masiva de teléfonos: ${fixed} corregido${fixed !== 1 ? "s" : ""}, ${errors} error${errors !== 1 ? "es" : ""}.`,
          metadata: { fixed, errors, employee_ids: appliedEmployeeIds },
          actor: auth.actor,
        });
      } catch (auditError) {
        logger.error("whatsapp.phone_audit.fix.audit_failed", auditError, { fixed, errors });
      }
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
