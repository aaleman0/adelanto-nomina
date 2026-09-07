/**
 * ¿Ya venció el enlace de firma?
 *
 * Vive fuera del componente a propósito: leer el reloj es impuro, y hacerlo
 * durante el render de un componente rompe la regla de pureza de React (y el
 * lint la marca). Aquí es una función normal, no un componente, y el llamador
 * decide cuándo evaluarla.
 *
 * Sin `expires_at` se considera vencido: es el lado seguro —mejor pedir un
 * enlace nuevo que mandar a firmar con uno que no sabemos si sigue vivo.
 */
export function estaVencido(expiresAt: string | null | undefined, ahora = Date.now()): boolean {
  if (!expiresAt) return true;
  const vence = new Date(expiresAt).getTime();
  if (Number.isNaN(vence)) return true;
  return vence <= ahora;
}
