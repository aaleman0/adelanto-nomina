import { NextResponse } from "next/server";
import { getStoredTemplates } from "@/lib/whatsapp/templates";
import { getOfferTemplateName, setOfferTemplateName } from "@/lib/whatsapp/offer-template";
import { requireRole } from "@/lib/auth/roles";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireRole("solo_lectura");
  if (!auth.ok) return auth.response;

  try {
    const [templates, offerTemplate] = await Promise.all([
      getStoredTemplates(),
      getOfferTemplateName(),
    ]);
    // `offerTemplate` viaja junto a la lista para que la pantalla de envío no
    // necesite una segunda petición solo para saber cuál mostrar.
    return NextResponse.json({ ok: true, templates, offerTemplate });
  } catch (err) {
    logger.error("whatsapp.templates.get_error", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Error inesperado." },
      { status: 500 },
    );
  }
}

/**
 * Fija qué plantilla se usa para las ofertas. Solo admin: cambiarla afecta lo
 * que reciben todos los empleados en el siguiente envío.
 */
export async function POST(request: Request) {
  const auth = await requireRole("admin");
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json()) as { name?: unknown };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ ok: false, error: "Falta el nombre de la plantilla." }, { status: 400 });
    }

    // Se comprueba contra las plantillas sincronizadas: guardar un nombre que
    // Meta no conoce dejaría el envío roto sin aviso hasta el momento de enviar.
    const templates = await getStoredTemplates();
    if (!templates.some((t) => t.name === name)) {
      return NextResponse.json(
        { ok: false, error: "Esa plantilla no está sincronizada desde Meta." },
        { status: 400 },
      );
    }

    await setOfferTemplateName(name);
    logger.info("whatsapp.offer_template.set", { name });
    return NextResponse.json({ ok: true, offerTemplate: name });
  } catch (err) {
    logger.error("whatsapp.offer_template.set_error", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Error inesperado." },
      { status: 500 },
    );
  }
}
