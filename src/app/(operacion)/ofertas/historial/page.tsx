import { Suspense } from "react";
import { LoadingRows } from "@/ui/states";
import { HistorialEnvios } from "../_ui/historial-envios";

export const dynamic = "force-dynamic";

/**
 * VER ENVÍOS ANTERIORES.
 *
 * Los filtros y la página viven en la URL, así que la lista es un componente de
 * cliente con `useSearchParams`. Next 16 exige envolverlo en <Suspense> o la
 * compilación de producción falla, y de paso da el esqueleto de carga.
 */
export default function PaginaHistorialDeEnvios() {
  return (
    <Suspense fallback={<Esqueleto />}>
      <HistorialEnvios />
    </Suspense>
  );
}

function Esqueleto() {
  return (
    <div className="mx-auto w-full max-w-[1400px] px-8 py-8">
      <div className="mb-8 space-y-3">
        <div className="skeleton h-11 w-72" />
        <div className="skeleton h-6 w-[30rem]" />
      </div>
      <LoadingRows rows={5} />
    </div>
  );
}
