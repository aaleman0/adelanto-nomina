import { Suspense } from "react";
import { LoadingRows, LoadingTiles } from "@/ui/states";
import { DetalleEnvio } from "../_ui/detalle-envio";

export const dynamic = "force-dynamic";

/**
 * VER UN ENVÍO.
 *
 * En Next 16 `params` es una promesa: se espera aquí y el identificador baja ya
 * resuelto al componente de cliente, que es quien pagina y filtra contra
 * /api/whatsapp/bulk/detail.
 */
export default async function PaginaDetalleDeEnvio({
  params,
}: {
  params: Promise<{ envioId: string }>;
}) {
  const { envioId } = await params;

  return (
    <Suspense fallback={<Esqueleto />}>
      <DetalleEnvio envioId={envioId} />
    </Suspense>
  );
}

function Esqueleto() {
  return (
    <div className="mx-auto w-full max-w-[1400px] px-8 py-8">
      <div className="mb-8 space-y-3">
        <div className="skeleton h-6 w-56" />
        <div className="skeleton h-11 w-96" />
      </div>
      <LoadingTiles tiles={4} />
      <div className="mt-8">
        <LoadingRows rows={5} />
      </div>
    </div>
  );
}
