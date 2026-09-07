import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/roles";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

/**
 * Datos de la empresa (acreedor + testigos) que aparecen en TODOS los contratos.
 * Son constantes: se ponen una vez y el generador del contrato las lee de
 * `company_settings`. Esta pantalla es la forma de editarlas sin tocar SQL.
 *
 * Toda la sección `/settings` es admin-only (ver `src/app/settings/layout.tsx`);
 * el endpoint exige `admin` por su cuenta como defensa en profundidad.
 */
const COMPANY_KEYS = [
  "acreedor_razon_social",
  "acreedor_rfc",
  "acreedor_representante",
  "acreedor_domicilio",
  "acreedor_banco",
  "acreedor_cuenta",
  "acreedor_clabe",
  "testigo_1_nombre",
  "testigo_2_nombre",
] as const;

type CompanyKey = (typeof COMPANY_KEYS)[number];

const BodySchema = z.object({
  acreedor_razon_social: z.string().trim().max(500),
  acreedor_rfc: z.string().trim().max(20),
  acreedor_representante: z.string().trim().max(300),
  acreedor_domicilio: z.string().trim().max(500),
  acreedor_banco: z.string().trim().max(120),
  acreedor_cuenta: z.string().trim().max(40),
  acreedor_clabe: z.string().trim().max(40),
  testigo_1_nombre: z.string().trim().max(300),
  testigo_2_nombre: z.string().trim().max(300),
});

export async function GET() {
  const auth = await requireRole("admin");
  if (!auth.ok) return auth.response;

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("company_settings")
      .select("key, value")
      .in("key", [...COMPANY_KEYS]);

    if (error) throw error;

    const config: Record<CompanyKey, string> = Object.fromEntries(
      COMPANY_KEYS.map((k) => [k, ""]),
    ) as Record<CompanyKey, string>;
    for (const row of data ?? []) {
      if ((COMPANY_KEYS as readonly string[]).includes(row.key)) {
        config[row.key as CompanyKey] = row.value ?? "";
      }
    }

    return NextResponse.json({ ok: true, config });
  } catch (err) {
    logger.error("settings.company.get_error", err);
    return NextResponse.json({ ok: false, error: "Error al obtener los datos." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireRole("admin");
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Datos inválidos." }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    // `value` es NOT NULL; nunca se manda null. Upsert por la unique key.
    const rows = COMPANY_KEYS.map((k) => ({ key: k, value: parsed.data[k] }));
    const { error } = await supabase
      .from("company_settings")
      .upsert(rows, { onConflict: "key" });

    if (error) throw error;

    logger.info("settings.company.saved", { userId: auth.actor.userId });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("settings.company.save_error", err);
    return NextResponse.json({ ok: false, error: "Error al guardar." }, { status: 500 });
  }
}
