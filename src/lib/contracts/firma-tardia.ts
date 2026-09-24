/**
 * Qué hacer con una firma que llega sobre una solicitud que ya no está en pie.
 *
 * Al entrar un ciclo nuevo, `imports/apply.ts` deja la solicitud anterior en
 * `reemplazada` y mata su enlace. Pero el documento sigue vivo del lado de
 * EasyLex —su API no expone ninguna forma de cancelarlo— y quien ya tenía
 * abierta la pantalla de firma puede terminarla después. El webhook llega igual,
 * horas más tarde.
 *
 * Aceptarla como firma buena no es un detalle de estado: el Excel de dispersión
 * arma el pago con las solicitudes en `firmado` del lote, así que revivir una
 * solicitud reemplazada mete un pago con el MONTO ANTERIOR en un ciclo que la
 * empresa ya cerró, y encima invisible: el tablero solo arma filas sobre la
 * oferta vigente.
 *
 * Tampoco se puede tirar: la persona firmó de verdad y esa firma es evidencia.
 * Por eso son dos caminos y no un sí/no.
 *
 * Mientras el enlace duraba dos horas esto casi no podía pasar —moría antes de
 * que nadie reimportara—; con un enlace de un día la rendija dura toda la tarde.
 *
 * Falla en CERRADO, igual que la ventana: ante un estado que no reconoce, guarda
 * la evidencia y avisa en vez de registrar el pago. Una firma buena que se queda
 * esperando al operador se arregla; un pago equivocado ya salió del banco.
 */
export type QueHacerConLaFirma =
  /** Solicitud en pie: se marca firmada, la oferta también, y sigue su curso al pago. */
  | "registrar"
  /** Solicitud fuera de curso: se guarda la evidencia y se avisa, pero NO se revive. */
  | "solo_evidencia";

/**
 * Los únicos estados desde los que una solicitud puede pasar a firmada. Es una
 * lista blanca a propósito: un estado nuevo que nadie previó cae del lado
 * seguro, no del lado que mueve dinero.
 */
const ESTADOS_EN_CURSO = ["recibida", "generando", "link_generado"];

export function queHacerConLaFirma(
  estadoSolicitud: string | null | undefined,
): QueHacerConLaFirma {
  return ESTADOS_EN_CURSO.includes(estadoSolicitud ?? "") ? "registrar" : "solo_evidencia";
}
