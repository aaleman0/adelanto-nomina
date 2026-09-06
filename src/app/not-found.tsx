import Link from "next/link";

/**
 * Ruta inexistente. Sin jerga ("404", "Not Found") y con una salida clara:
 * el operador nunca queda atrapado en una pantalla sin siguiente paso.
 * Por convención de Next, este archivo no recibe props.
 */
export default function NoEncontrado() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-paper px-8">
      <div className="w-full max-w-lg rounded-xl bg-surface p-10 text-center shadow-2">
        <h1 className="text-[31px] font-bold leading-tight text-ink">Esta página no existe</h1>
        <p className="mt-3 text-[19px] leading-relaxed text-ink-2">
          Puede que el enlace esté mal escrito o que la pantalla haya cambiado de lugar.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex h-14 items-center justify-center rounded-md border-b-[3px] border-action-press bg-action px-7 text-[19px] font-semibold text-white hover:bg-action-hover"
        >
          Ir a Pendientes
        </Link>
      </div>
    </div>
  );
}
