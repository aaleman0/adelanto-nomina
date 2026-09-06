import { redirect, notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { estaVencido } from "@/lib/contracts/link-expiry";

export const dynamic = "force-dynamic";

type FirmarPageProps = {
  params: Promise<{ signerId: string }>;
};

/**
 * Puente hacia la firma en EasyLex.
 *
 * Es una pantalla de PASO, no de lectura: si el enlace sirve, redirige de
 * inmediato. Solo se pinta algo cuando NO se puede continuar (ya firmado o
 * vencido), y entonces dice qué pasó y qué hacer.
 *
 * La abre el empleado desde su teléfono y no tiene cuenta: la autenticación es
 * el identificador de firmante, que además se valida contra la base y su
 * vigencia de 2 horas.
 */
export default async function FirmarPage({ params }: FirmarPageProps) {
  const { signerId } = await params;
  if (!signerId) notFound();

  const supabase = getSupabaseAdmin();
  const { data: intento, error } = await supabase
    .from("contract_attempts")
    .select("id, status, expires_at")
    .eq("raw_response->>signer_id", signerId)
    .maybeSingle();

  if (error || !intento) notFound();

  if (intento.status === "firmado") {
    return (
      <Aviso
        tono="listo"
        titulo="Este contrato ya está firmado"
        texto="No necesitas volver a abrir el enlace. Tu adelanto sigue su curso."
      />
    );
  }

  if (estaVencido(intento.expires_at)) {
    return (
      <Aviso
        tono="alto"
        titulo="Este enlace ya venció"
        texto="Los enlaces de firma duran 2 horas. Pídele uno nuevo a tu empresa para poder firmar."
      />
    );
  }

  // Sin base de firma configurada no hay a dónde mandar al empleado. Fallar en
  // voz alta es mejor que redirigir a un dominio muerto.
  const baseDeFirma = process.env.EASYLEX_SIGNING_LINK_BASE_URL;
  if (!baseDeFirma) notFound();

  redirect(`${baseDeFirma}/${signerId}`);
}

function Aviso({
  tono,
  titulo,
  texto,
}: {
  tono: "listo" | "alto";
  titulo: string;
  texto: string;
}) {
  const estilo = tono === "listo" ? { punto: "bg-done", borde: "border-done-line" } : { punto: "bg-failed", borde: "border-failed-line" };

  return (
    <main className="flex min-h-dvh flex-col bg-paper px-5 py-8">
      <header className="mx-auto w-full max-w-lg">
        <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-ink-3">Adelanto</p>
        <p className="text-[21px] font-bold leading-tight text-ink">de nómina</p>
      </header>
      <div className="mx-auto flex w-full max-w-lg flex-1 items-center">
        <div className={`w-full rounded-xl border-2 bg-surface p-7 shadow-2 ${estilo.borde}`}>
          <span aria-hidden="true" className={`block h-4 w-4 rounded-full ${estilo.punto}`} />
          <h1 className="mt-5 text-[27px] font-bold leading-tight text-ink">{titulo}</h1>
          <p className="mt-3 text-[19px] leading-relaxed text-ink-2">{texto}</p>
        </div>
      </div>
    </main>
  );
}
