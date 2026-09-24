import { getSupabaseAdmin } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

/**
 * Ventana para PEDIR el adelanto.
 *
 * Regla del cliente: el adelanto no queda disponible para pedirlo cuando uno
 * quiera. Lo abre la EMPRESA al mandar la oferta y dura **un día**; fuera de ahí
 * nadie lo puede pedir por su cuenta. Aplica igual al chatbot y al enlace de
 * auto-servicio `/solicitar`, que son dos puertas al mismo contrato.
 *
 * No confundirla con la vida del ENLACE DE FIRMA (`link-ttl.ts`, un día). Son
 * dos reglas distintas: cuánto tiempo la empresa acepta solicitudes, y cuánto
 * tiempo tiene para firmar quien ya pidió. Se derivaban del mismo número y
 * separarlas fue el punto de este cambio: no volver a atarlas.
 *
 * Todo lo que se decide aquí falla en CERRADO. Negarle el adelanto a quien sí
 * lo merecía se arregla en un minuto —el operador le reenvía la oferta y la
 * ventana vuelve a abrir—; un contrato legalmente vinculante que nadie ofreció
 * ya no se deshace. Y se dispara desde superficies sin sesión: basta el
 * teléfono del empleado o su enlace.
 */

/**
 * Cuánto tiempo la empresa acepta solicitudes después de mandar la oferta.
 *
 * Empezó en 2 h y el 2026-09-24 el cliente la subió a un día. El motivo fue un
 * ciclo real: las ofertas salieron a las 5:08 de la tarde, el plazo cerró a las
 * 7:08, y de 16 personas 11 nunca contestaron —una de ellas abrió el mensaje a
 * la mañana siguiente y se encontró con que ya no podía pedir—. Un plazo de dos
 * horas al final de la jornada no lo alcanza quien está trabajando.
 *
 * Sigue siendo el control de la empresa sobre cuándo se puede pedir, y sigue sin
 * tener por qué durar lo mismo que el enlace de firma (`link-ttl.ts`). Que hoy
 * coincidan en 24 es casualidad de los dos valores, no una relación: son plazos
 * de reglas distintas, medidos desde momentos distintos —esta desde que salió la
 * oferta, aquella desde que se generó el contrato—. No derivar una de la otra.
 */
export const VENTANA_OFERTA_HORAS = 24;
export const VENTANA_OFERTA_MS = VENTANA_OFERTA_HORAS * 60 * 60 * 1000;

/** Cómo se le nombra el plazo a la persona, derivado para que no se desfase. */
export const DURACION_DE_LA_VENTANA = `${VENTANA_OFERTA_HORAS} horas`;

/**
 * Hasta cuándo se respeta una entrega tardía.
 *
 * La ventana corre desde que el mensaje LLEGÓ al teléfono, no desde que salió:
 * quien trae el celular sin señal en planta, o sin pila toda la mañana, recibe
 * la oferta horas después, y medir desde el envío le cerraría el plazo antes de
 * verla. Pero Meta reintenta la entrega hasta por 30 días, y un teléfono que
 * reaparece una semana después no debe abrir un adelanto que la empresa ya dio
 * por cerrado.
 *
 * ⚠️ Con la ventana en 24 h este tope MANDA SIEMPRE, porque la entrega nunca es
 * anterior al envío: el cierre acaba siendo `envío + 24 h` para todo el mundo, y
 * el anclaje en la entrega no cambia ningún resultado. La regla efectiva de hoy,
 * dicha en voz alta: **un día desde que la empresa mandó la oferta.** El anclaje
 * se conserva porque es la regla general y vuelve a importar en cuanto la
 * ventana baje de 24 h; si alguien la acorta, la justicia con el teléfono sin
 * señal reaparece sola y sin tocar nada.
 *
 * Este día no tiene nada que ver con el día que dura el enlace de firma
 * (`link-ttl.ts`) ni con la ventana de sesión de 24 h de Meta. Son plazos de
 * reglas distintas que coinciden en el número; unificarlos por parecerse es
 * justo el error que aquí se deshizo.
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
 *   también en cada clic de /solicitar. Contarlo dejaría que cada solicitud
 *   abriera otra ventana, y esa ventana daría pie a la siguiente: se podría
 *   pedir un contrato nuevo tras otro sin que la empresa ofreciera nada. El
 *   bucle es toda la razón y se sostiene sola, sin comparar plazos con nada.
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
 *
 * `ventanaMs` existe solo para las pruebas: con el valor de hoy (ventana igual al
 * tope) el anclaje en la entrega no cambia ningún resultado, así que sin poder
 * inyectar un plazo más corto esa parte de la lógica no se podría probar y se
 * podría borrar sin que nada fallara. Producción nunca pasa este argumento.
 */
export function evaluarVentana(
  envios: EnvioDeOferta[],
  ahora = Date.now(),
  ventanaMs = VENTANA_OFERTA_MS,
): EstadoVentana {
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
    // nadie. Con los valores de hoy (ventana y tope iguales) el segundo término
    // del `min` siempre gana; ver TOPE_ENTREGA_TARDIA_MS.
    const inicio = Math.min(Math.max(salio, llego ?? salio), ahora);
    const cierre = Math.min(inicio + ventanaMs, salio + TOPE_ENTREGA_TARDIA_MS);

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
 *   fuera de la ventana. Quien alcanzó a pedir tiene un día entero para firmar,
 *   contado desde que se generó su contrato, no desde la oferta.
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
