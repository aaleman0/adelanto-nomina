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

  const signingLinkBaseUrl =
    process.env.EASYLEX_SIGNING_LINK_BASE_URL ?? "https://widgetsandbox.easylex.com/firmar";

  redirect(`${signingLinkBaseUrl}/${signerId}`);
}
