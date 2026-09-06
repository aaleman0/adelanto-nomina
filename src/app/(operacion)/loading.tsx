import { LoadingTiles, LoadingRows } from "@/ui/states";

/**
 * Carga de una pantalla del backoffice. Esqueletos con la forma real de lo que
 * viene (resumen arriba, lista abajo), nunca un spinner genérico: el operador
 * ya sabe qué va a aparecer y dónde antes de que llegue.
 *
 * Por convención de Next, este archivo no recibe props.
 */
export default function CargandoPantalla() {
  return (
    <div className="mx-auto w-full max-w-[1400px] px-8 py-8">
      <div className="mb-8 space-y-3">
        <div className="skeleton h-11 w-80" />
        <div className="skeleton h-6 w-[28rem]" />
      </div>
      <LoadingTiles />
      <div className="mt-8">
        <LoadingRows rows={5} />
      </div>
    </div>
  );
}
