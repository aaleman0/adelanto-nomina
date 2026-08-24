import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/server";

type FirmarPageProps = {
  params: Promise<{
    signerId: string;
  }>;
};

function ExpiradoCard({ title, message }: { title: string; message: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full rounded-xl border border-border bg-surface p-6 text-center">
        <h1 className="text-lg font-medium text-text-primary">{title}</h1>
        <p className="mt-2 text-sm text-text-muted">{message}</p>
      </div>
    </div>
  );
}

export default async function FirmarPage({ params }: FirmarPageProps) {
  const { signerId } = await params;

  if (!signerId) {
    notFound();
  }

  const supabase = getSupabaseAdmin();
  const { data: attempt, error } = await supabase
    .from("contract_attempts")
    .select("id, status, expires_at")
    .eq("raw_response->>signer_id", signerId)
    .maybeSingle();

  if (error || !attempt) {
    notFound();
  }

  if (attempt.status === "firmado") {
    return (
      <ExpiradoCard
        title="Contrato ya firmado"
        message="Este documento ya fue firmado. No es necesario volver a abrir el enlace."
      />
    );
  }

  const expired =
    !attempt.expires_at ||
    new Date(attempt.expires_at).getTime() <= Date.now();

  if (expired) {
    return (
      <ExpiradoCard
        title="Link de firma expirado"
        message="El enlace ya no es válido. Pasaron más de 2 horas desde que se generó."
      />
    );
  }

  // Sin base de firma configurada no hay a dónde redirigir. Antes caía a
  // `widgetsandbox.easylex.com` (dominio MUERTO / NXDOMAIN): mandaba al firmante
  // a un "sitio no encontrado". Mejor fallar en voz alta que redirigir a la nada.
  const signingLinkBaseUrl = process.env.EASYLEX_SIGNING_LINK_BASE_URL;
  if (!signingLinkBaseUrl) {
    notFound();
  }

  redirect(`${signingLinkBaseUrl}/${signerId}`);
}
