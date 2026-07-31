import { redirect } from "next/navigation";
import { notFound } from "next/navigation";

type FirmarPageProps = {
  params: Promise<{
    signerId: string;
  }>;
};

export default async function FirmarPage({ params }: FirmarPageProps) {
  const { signerId } = await params;

  if (!signerId) {
    notFound();
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
