import { getSupabaseAdmin } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { LINK_TTL_HOURS } from "./link-ttl";

/**
 * Ventana para PEDIR el adelanto.
 *
 * Regla del cliente: el adelanto no queda disponible para pedirlo cuando uno
 * quiera. Lo abre la EMPRESA al mandar la oferta y dura lo mismo que el enlace
 * de firma; fuera de ahí nadie lo puede pedir por su cuenta. Aplica igual al
 * chatbot y al enlace de auto-servicio `/solicitar`, que son dos puertas al
 * mismo contrato.
 *
 * Todo lo que se decide aquí falla en CERRADO. Negarle el adelanto a quien sí
 * lo merecía se arregla en un minuto —el operador le reenvía la oferta y la
 * ventana vuelve a abrir—; un contrato legalmente vinculante que nadie ofreció
 * ya no se deshace. Y se dispara desde superficies sin sesión: basta el
 * teléfono del empleado o su enlace.
 */

/** Dura lo mismo que el enlace de firma: una sola fuente de verdad. */
export const VENTANA_OFERTA_MS = LINK_TTL_HOURS * 60 * 60 * 1000;

/**
 * Hasta cuándo se respeta una entrega tardía.
 *
 * La ventana corre desde que el mensaje LLEGÓ al teléfono, no desde que salió:
 * quien trae el celular sin señal en planta, o sin pila toda la mañana, recibe
 * la oferta horas después, y medir desde el envío le cerraría el plazo antes de
 * verla. Pero Meta reintenta la entrega hasta por 30 días, y un teléfono que
 * reaparece una semana después no debe abrir un adelanto que la empresa ya dio
 * por cerrado. Un día cubre un turno sin señal o una noche con el teléfono
 * apagado.
 */
export const TOPE_ENTREGA_TARDIA_MS = 24 * 60 * 60 * 1000;

/**
 * Cuánto puede adelantarse una fecha sin dejar de creerse. Los relojes de la
 * base y del servidor no coinciden al segundo; una fecha horas en el futuro ya
 * no es desfase sino un dato roto, y aceptarla dejaría la ventana abierta
 * indefinidamente.
 */
const DESFASE_TOLERADO_MS = 10 * 60 * 1000;

/**
 * El único mensaje con el que la EMPRESA abre la ventana: el envío de ofertas
 * desde /ofertas, que solo puede lanzar un operador.
 *
 * Los demás mensajes que salen hacia la persona NO cuentan, porque los provoca
 * la propia solicitud:
 * - `contract_link` lo manda el sistema cada vez que se pide el contrato,
 *   también en cada clic de /solicitar. Contarlo dejaría que cada solicitud se
 *   abriera otra ventana, y como el enlace se registra después de fijar su
 *   vencimiento, esa ventana cerraría siempre más tarde que el enlace: se podría
 *   pedir un contrato nuevo tras otro sin que la empresa ofreciera nada.
 * - `contract_offer` lo escribe el sistema cuando la persona pide.
 *
 * Un operador que genera el contrato desde el expediente no necesita ventana: el
 * contrato ya queda hecho. Para reabrírsela a alguien, se le reenvía la oferta.
 */
export const MENSAJE_QUE_ABRE_LA_VENTANA = "bulk_contract_offer";

/**
 * Prueba de que Meta ACEPTÓ el mensaje. Las filas de envío se crean antes de
 * llamar a Meta —como reclamo o al encolar— y sobreviven al fracaso; sin este
 * filtro, una plantilla rota le abriría la ventana a alguien que no vio nada.
 * Se mira `delivery_status` y no `status`, que mezcla vocabularios desde la
 * migración de ManyChat.
 */
export const ENTREGAS_QUE_CUENTAN = ["sent", "delivered", "read"];

/** La ventana abierta, si la hay, sale de los envíos más recientes. */
const ENVIOS_A_REVISAR = 20;

export type EnvioDeOferta = { created_at: string | null; delivered_at: string | null };

export type EstadoVentana =
  | { abierta: true; cierraEn: number }
  | { abierta: false; motivo: "sin_envio" | "fuera_de_plazo" | "error" };

function instante(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * La decisión, sin base de datos: dados los envíos que la empresa le hizo a la
 * persona, ¿puede pedir en el momento `ahora`? Pura para probar cada caso con el
 * reloj fijo.
 */
export function evaluarVentana(envios: EnvioDeOferta[], ahora = Date.now()): EstadoVentana {
  let huboEnvio = false;
  let cierraEn: number | null = null;

  for (const envio of envios) {
    const salio = instante(envio.created_at);
    if (salio === null || salio - ahora > DESFASE_TOLERADO_MS) continue;
    huboEnvio = true;

    const llegoSegunMeta = instante(envio.delivered_at);
    const llego =
      llegoSegunMeta !== null && llegoSegunMeta - ahora <= DESFASE_TOLERADO_MS ? llegoSegunMeta : null;

    // Desde que llegó; si Meta nunca avisó la entrega, desde que salió. Se toma
    // el más tardío por si un desfase pusiera la entrega antes del envío, y
    // nunca empieza en el futuro: un reloj adelantado no le quita el plazo a
    // nadie.
    const inicio = Math.min(Math.max(salio, llego ?? salio), ahora);
    const cierre = Math.min(inicio + VENTANA_OFERTA_MS, salio + TOPE_ENTREGA_TARDIA_MS);

    if (ahora <= cierre && (cierraEn === null || cierre > cierraEn)) cierraEn = cierre;
  }

  if (cierraEn !== null) return { abierta: true, cierraEn };
  return { abierta: false, motivo: huboEnvio ? "fuera_de_plazo" : "sin_envio" };
}

/**
 * Qué toca cuando alguien quiere pedir, según su oferta y la ventana. Lo usan
 * el chatbot y /solicitar para decir lo mismo por las dos puertas.
 *
 * - `firmada` sigue aunque la ventana esté cerrada: el sistema solo le confirma
 *   que ya firmó, no genera nada.
 * - `solicitada` con la ventana cerrada NO sigue: ya pidió dentro del plazo y
 *   tiene su enlace, y si se le venció, pedir de nuevo generaría un contrato
 *   fuera de la ventana. Quien alcanzó a pedir tiene sus 2 horas para firmar.
 */
export type PasoAlPedir = "pedir" | "ya_pidio" | "sin_envio" | "fuera_de_plazo" | "error";

export function pasoAlPedir(estadoOferta: string | null | undefined, ventana: EstadoVentana): PasoAlPedir {
  if (estadoOferta === "firmada") return "pedir";
  if (ventana.abierta) return "pedir";
  if (estadoOferta === "solicitada") return "ya_pidio";
  return ventana.motivo;
}

/**
 * ¿Está abierta la ventana para esta persona en el momento en que pidió? Nunca
 * lanza: ante un fallo, cerrada.
 *
 * Se juzga sobre SU fila y nada más. El RFC es único en `employees`, así que no
 * hay filas de la misma persona que juntar; y juntar por teléfono mezclaría a
 * personas distintas que comparten celular: la oferta enviada a una le abriría
 * la ventana a la otra, con su propio contrato.
 *
 * `ahora` es cuándo pidió, no cuándo se procesa: un "Sí" dado a tiempo que Meta
 * nos entrega tarde no debe encontrarse el plazo cerrado.
 */
export async function ventanaDeLaPersona(employeeId: string, ahora = Date.now()): Promise<EstadoVentana> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("whatsapp_contract_messages")
      .select("created_at, delivered_at")
      .eq("employee_id", employeeId)
      .eq("message_type", MENSAJE_QUE_ABRE_LA_VENTANA)
      .not("wa_message_id", "is", null)
      .in("delivery_status", ENTREGAS_QUE_CUENTAN)
      .order("created_at", { ascending: false })
      .limit(ENVIOS_A_REVISAR);

    if (error) throw error;
    return evaluarVentana((data ?? []) as EnvioDeOferta[], ahora);
  } catch (err) {
    // Del otro lado se genera un contrato legalmente vinculante: una caída de
    // la base no puede funcionar como autorización.
    logger.error("oferta.ventana.sin_verificar", err, { employeeId });
    return { abierta: false, motivo: "error" };
  }
}
