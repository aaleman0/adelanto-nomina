import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * Qué plantilla se usa para la oferta de adelanto.
 *
 * El portal acumula todas las plantillas que Meta ha aprobado alguna vez —las
 * de prueba, las obsoletas, la de ejemplo—, pero para enviar ofertas solo se usa
 * UNA. Elegir de una lista larga en el paso del envío es una oportunidad de
 * equivocarse con consecuencia real: ya pasó, y los empleados recibieron un
 * enlace roto.
 *
 * Por eso la elección se hace UNA VEZ en Ajustes y queda guardada, en vez de
 * repetirse en cada envío. Se guarda el NOMBRE, no un id, porque es lo que Meta
 * usa para identificarla y sobrevive a re-sincronizaciones.
 */
const CLAVE = "whatsapp_offer_template";

export async function getOfferTemplateName(): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("settings")
    .select("value")
    .eq("key", CLAVE)
    .maybeSingle();

  // Sin ajuste guardado no se bloquea nada: el envío vuelve a ofrecer la lista
  // completa, que es el comportamiento anterior.
  if (error || !data?.value) return null;
  return data.value as string;
}

export async function setOfferTemplateName(name: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("settings")
    .upsert([{ key: CLAVE, value: name }], { onConflict: "key" });
  if (error) throw error;
}
