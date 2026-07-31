import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/roles";
import { isUuid, invalidIdResponse } from "@/lib/api/validation";

export const runtime = "nodejs";

const BUCKET = "contratos-firmados";

/**
 * Descarga del contrato FIRMADO archivado. Busca el intento con
 * `signed_pdf_path` para la solicitud y redirige a una signed URL de descarga
 * (corta) del bucket privado. Es dato sensible: exige rol `operaciones`.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ contractRequestId: string }> },
) {
  const { contractRequestId } = await params;

  if (!isUuid(contractRequestId)) return invalidIdResponse("contractRequestId");

  const auth = await requireRole("operaciones");
  if (!auth.ok) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  const { data: attempt, error } = await supabase
    .from("contract_attempts")
    .select("signed_pdf_path")
    .eq("contract_request_id", contractRequestId)
    .not("signed_pdf_path", "is", null)
    .order("attempt_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Error al buscar el contrato firmado." }, { status: 500 });
  }

  if (!attempt?.signed_pdf_path) {
    return NextResponse.json(
      { error: 'El contrato firmado aún no está archivado. Usa "Reenviar al empleado" para generarlo.' },
      { status: 404 },
    );
  }

  const { data: signed, error: urlError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(attempt.signed_pdf_path, 60, { download: "contrato-firmado.pdf" });

  if (urlError || !signed?.signedUrl) {
    return NextResponse.json({ error: "No se pudo generar el enlace de descarga." }, { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl);
}
