"use server";

import { redirect } from "next/navigation";
import { verifySolicitarToken } from "@/lib/contracts/solicitar-token";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { pasoAlPedir, ventanaDeLaPersona } from "@/lib/contracts/ventana-oferta";
import { solicitudPrevia } from "@/lib/contracts/solicitud-previa";
import {
  parseRequestContractPayload,
  requestContractFromWhatsApp,
} from "@/lib/contracts/request-contract";

/**
 * Auto-servicio del empleado: valida el token del link, genera el contrato (o
 * reutiliza el vigente) y lo redirige a firmar en EasyLex. Es PÚBLICA (el
 * empleado no tiene sesión); el token firmado es la autenticación, no un rol.
 *
 * La generación ocurre en el POST (clic del botón), no en el GET, para que el
 * bot de vista previa de WhatsApp no dispare la creación del contrato.
 */
export async function solicitarContratoAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const verified = verifySolicitarToken(token);
  if (!verified.ok) {
    redirect(`/solicitar/${encodeURIComponent(token)}?error=${verified.reason}`);
  }

  const supabase = getSupabaseAdmin();
  const { data: emp } = await supabase
    .from("employees")
    .select("rfc, telefono_normalizado")
    .eq("id", verified.employeeId)
    .maybeSingle();

  if (!emp?.rfc) {
    redirect(`/solicitar/${encodeURIComponent(token)}?error=not_found`);
  }

  const back = `/solicitar/${encodeURIComponent(token)}`;

  // La misma ventana que el chatbot. La página ya esconde el botón fuera de
  // plazo, pero un POST no necesita pasar por la página: aquí, en la puerta que
  // genera el contrato, es donde de verdad se cierra. Se revisa aunque la fila no
  // tenga oferta vigente: nada debe llegar al pipeline sin pasar por la ventana.
  const { data: oferta } = await supabase
    .from("advance_offers")
    .select("id, status")
    .eq("employee_id", verified.employeeId)
    .eq("is_current", true)
    .maybeSingle();
  const paso = pasoAlPedir(
    oferta?.status as string | null | undefined,
    await ventanaDeLaPersona(verified.employeeId),
  );
  // Qué tiene ya esta persona. Se consulta SIEMPRE que haya pedido, no solo
  // cuando el paso es "ya_pidio": con la ventana abierta un día entero, el
  // segundo clic de quien ya pidió sigue cayendo en "pedir" —la ventana manda
  // sobre el estado de la oferta—, y aun así hay que saber si ya tiene enlace.
  const ofertaId = (oferta?.id as string | undefined) ?? null;
  const yaPidio = oferta?.status === "solicitada";
  const previa = yaPidio && ofertaId !== null ? await solicitudPrevia(ofertaId) : null;

  // Quien ya pidió solo sigue si tiene un enlace vigente: el pipeline lo reusa y
  // no crea otro contrato. En cualquier otro caso vuelve a la página, que calcula
  // de nuevo su situación real y le explica qué pasó.
  const puedeSeguir = paso === "pedir" || (paso === "ya_pidio" && previa === "enlace_vigente");
  if (!puedeSeguir) {
    redirect(back);
  }
  let result: Awaited<ReturnType<typeof requestContractFromWhatsApp>>;
  try {
    const input = parseRequestContractPayload({
      subscriber_id: emp.telefono_normalizado ?? emp.rfc,
      rfc: emp.rfc,
      telefono_normalizado: emp.telefono_normalizado,
    });
    // A quien ya tiene su enlace vivo no se le reenvía la plantilla: ya la tiene
    // en su WhatsApp y en este mismo clic se va a firmar. Reenviarla por cada
    // toque cobra un mensaje, le ensucia el historial y desplaza a la oferta como
    // "último mensaje" en el tablero. En el primer pedido sí se manda: es su copia.
    //
    // La condición mira lo que la persona TIENE, no el paso que le tocó. Atarlo
    // al paso funcionaba solo mientras la ventana fuera más corta que el enlace;
    // al subir la ventana a un día, el segundo clic volvía a caer en "pedir" y la
    // plantilla se reenviaba en cada toque durante veinticuatro horas.
    result = await requestContractFromWhatsApp(input, { skipSend: previa === "enlace_vigente" });
  } catch {
    redirect(`${back}?status=error`);
  }

  // Contrato listo → directo a firmar en EasyLex (URL externa).
  if (result.ok && result.status === "contract_ready" && result.link_easylex) {
    redirect(result.link_easylex);
  }

  redirect(`${back}?status=${result.status}`);
}
