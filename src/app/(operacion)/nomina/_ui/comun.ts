/**
 * Piezas compartidas por las dos pantallas de Nómina.
 *
 * Los formateadores se construyen UNA vez a nivel de módulo: `Intl` es caro y
 * además así no se instancia nada durante el render (regla de pureza de hooks).
 */

const FECHA = new Intl.DateTimeFormat("es-MX", { dateStyle: "long" });
const DINERO = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 2,
});
const ENTERO = new Intl.NumberFormat("es-MX");

/** Fecha en palabras. Un lote sin fecha aplicada existe, así que se contempla. */
export function formatearFecha(valor: string | null | undefined): string {
  if (!valor) return "Sin fecha";
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return "Sin fecha";
  return FECHA.format(d);
}

export function formatearDinero(valor: number): string {
  return DINERO.format(valor);
}

export function formatearEntero(valor: number): string {
  return ENTERO.format(valor);
}

/**
 * Un enlace que se ve como `<Button variant="secondary" size="lg">`.
 *
 * Se replican las clases en vez de envolver un `<Button>` dentro de un `<a>`
 * porque una descarga (CSV) y una navegación necesitan ser un ancla REAL: así
 * el navegador maneja el `Content-Disposition`, y el operador conserva "abrir
 * en pestaña nueva" y el clic derecho. Un botón con `onClick` rompería las dos.
 */
export const ENLACE_COMO_BOTON =
  "relative inline-flex h-14 items-center justify-center gap-2.5 rounded-md px-7 text-[19px] font-semibold " +
  "bg-surface text-ink border border-line-strong shadow-1 hover:bg-surface-hover " +
  "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-action";
