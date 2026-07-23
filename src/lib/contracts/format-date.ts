/**
 * Formatea una fecha ISO para mostrarla al empleado, en hora de Ciudad de
 * México. Se comparte entre el resultado de la solicitud de contrato y el
 * mensaje de WhatsApp del link de firma, para que ambos muestren el mismo
 * plazo con el mismo formato.
 */
export function formatDateForDisplay(isoDate: string): string {
  const date = new Date(isoDate);
  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Mexico_City",
  };
  return date.toLocaleDateString("es-MX", options);
}
