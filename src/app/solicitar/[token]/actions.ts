"use server";

import { redirect } from "next/navigation";
import { verifySolicitarToken } from "@/lib/contracts/solicitar-token";
import { getSupabaseAdmin } from "@/lib/supabase/server";
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
  let result: Awaited<ReturnType<typeof requestContractFromWhatsApp>>;
  try {
    const input = parseRequestContractPayload({
      subscriber_id: emp.telefono_normalizado ?? emp.rfc,
      rfc: emp.rfc,
      telefono_normalizado: emp.telefono_normalizado,
    });
    result = await requestContractFromWhatsApp(input);
  } catch {
    redirect(`${back}?status=error`);
  }

  // Contrato listo → directo a firmar en EasyLex (URL externa).
  if (result.ok && result.status === "contract_ready" && result.link_easylex) {
    redirect(result.link_easylex);
  }

  redirect(`${back}?status=${result.status}`);
}
