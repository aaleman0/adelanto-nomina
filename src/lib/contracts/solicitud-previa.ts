import { getSupabaseAdmin } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

/**
 * Qué tiene de verdad quien ya pidió su adelanto.
 *
 * Con la ventana cerrada, a quien ya pidió no se le genera otro contrato. Pero
 * decirle "revisa tu enlace" sin mirar sería mentirle en dos casos reales: si al
 * pedir se cayó EasyLex, nunca tuvo enlace; y si después un operador se lo
 * regeneró desde el expediente, sí tiene uno vigente que nadie le hizo llegar.
 * Aquí se miran la solicitud y su último intento para que el chatbot y
 * /solicitar digan lo mismo, y lo cierto.
 */
export type SolicitudPrevia = "enlace_vigente" | "enlace_vencido" | "fallo" | "en_proceso" | "sin_verificar";

/**
 * Cuánto tiene que quedarle a un enlace para entregarlo. Entregarlo es dejar que
 * el pipeline lo reuse; si venciera entre esta revisión y la suya, el pipeline
 * crearía un contrato nuevo fuera de la ventana. Con este margen esa carrera no
 * puede darse.
 */
export const MARGEN_PARA_REUSAR_MS = 2 * 60 * 1000;

type Intento = { status: string | null; signing_url: string | null; expires_at: string | null };

/** La decisión, sin base de datos. Pura para probar cada caso con el reloj fijo. */
export function evaluarSolicitudPrevia(
  estadoSolicitud: string | null | undefined,
  ultimoIntento: Intento | null,
  ahora = Date.now(),
): Exclude<SolicitudPrevia, "sin_verificar"> {
  const vence = ultimoIntento?.expires_at ? new Date(ultimoIntento.expires_at).getTime() : Number.NaN;
  if (
    ultimoIntento?.status === "generado" &&
    ultimoIntento.signing_url &&
    Number.isFinite(vence) &&
    vence - ahora > MARGEN_PARA_REUSAR_MS
  ) {
    return "enlace_vigente";
  }
  if (estadoSolicitud === "error" || ultimoIntento?.status === "error") return "fallo";
  if (estadoSolicitud === "link_generado") return "enlace_vencido";
  return "en_proceso";
}

/** Lo que tiene quien ya pidió esta oferta. Nunca lanza, y ante un fallo nunca entrega un enlace. */
export async function solicitudPrevia(offerId: string, ahora = Date.now()): Promise<SolicitudPrevia> {
  try {
    const supabase = getSupabaseAdmin();
    const { data: solicitud, error } = await supabase
      .from("contract_requests")
      .select("id, status")
      .eq("offer_id", offerId)
      .maybeSingle();
    if (error) throw error;
    if (!solicitud) return "en_proceso";

    const { data: intento, error: errorIntento } = await supabase
      .from("contract_attempts")
      .select("status, signing_url, expires_at")
      .eq("contract_request_id", solicitud.id)
      // El mismo orden con el que el pipeline elige qué intento reusar.
      .order("attempt_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (errorIntento) throw errorIntento;

    return evaluarSolicitudPrevia(solicitud.status as string | null, (intento as Intento | null) ?? null, ahora);
  } catch (err) {
    logger.error("oferta.solicitud_previa.sin_verificar", err, { offerId });
    return "sin_verificar";
  }
}
