import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getWhatsAppClient } from "@/lib/whatsapp/client";
import { normalizePhoneFromCsv } from "@/lib/whatsapp/phone-utils";
import { parseRequestContractPayload, requestContractFromWhatsApp } from "@/lib/contracts/request-contract";
import { logger } from "@/lib/logger";

/**
 * Chatbot de oferta de adelanto. La plantilla de oferta lleva dos botones de
 * respuesta rápida ("Sí, lo quiero" / "No, gracias"); al tocarlos, Meta manda un
 * webhook y AQUÍ se decide el flujo (generar contrato + link, o rechazar). Todo
 * el seguimiento se manda como mensaje de sesión libre (ventana de 24 h), sin
 * plantilla. Ver docs/whatsapp-chatbot.md.
 */

export type InboundMessage = {
  id: string;
  from: string;
  type: string;
  text?: { body: string };
  button?: { text?: string; payload?: string };
  interactive?: {
    type?: string;
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string };
  };
};

export type OfferReply = "si" | "no";
export type ButtonReply = { text: string | null; payload: string | null };

const money = (v: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 }).format(v);

function firstNameOf(nombre?: string | null): string {
  return (nombre ?? "").trim().split(/\s+/)[0] || "";
}

// --- Mensajes (puros, exportados para pruebas) ---

export function siSuccessMessage(
  firstName: string,
  montoStr: string,
  link: string,
  expiresPhrase: string,
): string {
  const hola = firstName ? `, ${firstName}` : "";
  return (
    `✅ ¡Listo${hola}! Generamos tu contrato de adelanto por ${montoStr}.\n\n` +
    `${link}\n\n` +
    `⏳ ${expiresPhrase} Fírmalo con tu identificación (INE) desde tu celular.`
  );
}

export function noMessage(firstName: string): string {
  const hola = firstName ? `, ${firstName}` : "";
  return `👍 Gracias por confirmar${hola}. No haremos el adelanto este periodo.`;
}

export const ALREADY_SIGNED_MESSAGE = (firstName: string) =>
  `✅ Ya firmaste tu contrato${firstName ? `, ${firstName}` : ""}. No necesitas hacer nada más. ¡Gracias!`;
export const ALREADY_REQUESTED_MESSAGE = (firstName: string) =>
  `Ya solicitaste tu adelanto${firstName ? `, ${firstName}` : ""}. Revisa el mensaje anterior con tu enlace de firma.`;
export const NO_OFFER_MESSAGE =
  "Por ahora no tienes un adelanto disponible para solicitar. Si crees que es un error, contacta a tu empresa.";
export const GENERATION_ERROR_MESSAGE =
  "😕 Tuvimos un problema al generar tu contrato. Inténtalo de nuevo en unos minutos o contacta a tu empresa.";
export const FALLBACK_MESSAGE =
  "Para continuar, usa los botones de arriba 👆: *Sí, lo quiero* o *No, gracias*.";

// --- Clasificación del botón (pura, testeable) ---

function strip(s?: string | null): string {
  return (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

/**
 * Mapea el texto/payload del botón a "si" | "no" (o null si no se reconoce).
 * Tolerante a acentos, mayúsculas y a payloads opcionales (SI_ADELANTO/NO_ADELANTO).
 */
export function classifyOfferReply(text?: string | null, payload?: string | null): OfferReply | null {
  const t = `${strip(payload)} ${strip(text)}`;
  // Palabras distintivas primero (los textos de botón son "Sí, lo quiero" / "No, gracias").
  if (t.includes("lo quiero") || t.includes("si_adelanto") || t.includes("si adelanto")) return "si";
  if (t.includes("gracias") || t.includes("no_adelanto") || t.includes("no adelanto")) return "no";
  // Respaldo: token suelto si/no.
  if (/(^|\s)si(,|\s|$)/.test(t)) return "si";
  if (/(^|\s)no(,|\s|$)/.test(t)) return "no";
  return null;
}

/** Extrae la respuesta de botón de un mensaje entrante (plantilla o interactivo). */
export function extractButtonReply(msg: InboundMessage): ButtonReply | null {
  if (msg.type === "button" && msg.button) {
    return { text: msg.button.text ?? null, payload: msg.button.payload ?? null };
  }
  if (msg.type === "interactive" && msg.interactive?.button_reply) {
    return { text: msg.interactive.button_reply.title ?? null, payload: msg.interactive.button_reply.id ?? null };
  }
  if (msg.type === "interactive" && msg.interactive?.list_reply) {
    return { text: msg.interactive.list_reply.title ?? null, payload: msg.interactive.list_reply.id ?? null };
  }
  return null;
}

// --- Búsqueda de empleado por teléfono ---

type FoundEmployee = {
  employee: { id: string; rfc: string; nombre: string | null; telefono_normalizado: string | null };
  offer: { id: string; status: string; is_eligible: boolean; monto_prestamo_autorizado: number } | null;
};

async function findEmployeeForPhone(from: string): Promise<FoundEmployee | null> {
  const supabase = getSupabaseAdmin();
  const normalized = normalizePhoneFromCsv(from) ?? from.replace(/\D/g, "");

  const { data: emps, error } = await supabase
    .from("employees")
    .select("id, rfc, nombre, telefono_normalizado")
    .eq("telefono_normalizado", normalized);

  if (error) throw error;
  if (!emps || emps.length === 0) return null;

  // Con duplicados (misma persona reimportada), preferir la fila con oferta vigente.
  for (const e of emps) {
    const { data: offer } = await supabase
      .from("advance_offers")
      .select("id, status, is_eligible, monto_prestamo_autorizado")
      .eq("employee_id", e.id)
      .eq("is_current", true)
      .maybeSingle();
    if (offer) {
      return {
        employee: e as FoundEmployee["employee"],
        offer: { ...offer, monto_prestamo_autorizado: Number(offer.monto_prestamo_autorizado ?? 0) },
      };
    }
  }
  return { employee: emps[0] as FoundEmployee["employee"], offer: null };
}

// --- Ramas del flujo ---

async function handleSi(from: string, found: FoundEmployee): Promise<void> {
  const { employee, offer } = found;
  const first = firstNameOf(employee.nombre);
  const client = getWhatsAppClient();

  // Genera (o reusa) el contrato. `skipSend` evita que el pipeline mande su
  // propio WhatsApp: aquí mandamos nuestro mensaje de sesión personalizado.
  const input = parseRequestContractPayload({
    subscriber_id: employee.telefono_normalizado ?? employee.rfc,
    rfc: employee.rfc,
    telefono_normalizado: employee.telefono_normalizado,
  });
  const result = await requestContractFromWhatsApp(input, { skipSend: true });

  let text: string;
  if (result.ok && result.status === "contract_ready" && result.link_easylex) {
    // Tiempo real de expiración (no un "2 horas" fijo): si el intento se reusó,
    // quedan < 2 h y el mensaje debe decir la verdad. Usa el expires_at del
    // resultado, que es el mismo que enforza /firmar y EasyLex.
    const expiresPhrase = result.expires_at_formatted
      ? `El enlace vence el ${result.expires_at_formatted}.`
      : "El enlace vence en 2 horas.";
    text = siSuccessMessage(
      first,
      money(Number(offer?.monto_prestamo_autorizado ?? 0)),
      result.link_easylex,
      expiresPhrase,
    );
  } else if (result.status === "already_signed") {
    text = ALREADY_SIGNED_MESSAGE(first);
  } else if (result.status === "no_offer" || result.status === "not_eligible") {
    text = NO_OFFER_MESSAGE;
  } else {
    text = GENERATION_ERROR_MESSAGE;
  }

  logger.info("whatsapp.chatbot.si", { employeeId: employee.id, resultStatus: result.status });
  await client.sendTextMessage(from, text);
}

async function handleNo(from: string, found: FoundEmployee): Promise<void> {
  const { employee, offer } = found;
  const supabase = getSupabaseAdmin();
  const first = firstNameOf(employee.nombre);
  const client = getWhatsAppClient();

  if (!offer) {
    // Sin oferta vigente: no hay qué rechazar; confirmamos amablemente.
    await client.sendTextMessage(from, noMessage(first));
    return;
  }

  // Update ATÓMICO: solo rechaza si la oferta sigue 'vigente'. Un tap tardío de
  // "No" (los botones quick-reply siguen activos en el chat) NO debe pisar una
  // oferta ya 'firmada'/'solicitada' ni contradecir un contrato en curso. El
  // `.eq("status","vigente")` además cierra la carrera firma/No.
  const { data: updated } = await supabase
    .from("advance_offers")
    .update({ status: "rechazada", updated_at: new Date().toISOString() })
    .eq("id", offer.id)
    .eq("status", "vigente")
    .select("id");

  if (updated && updated.length > 0) {
    logger.info("whatsapp.chatbot.no", { employeeId: employee.id, offerId: offer.id });
    await client.sendTextMessage(from, noMessage(first));
    return;
  }

  // No estaba 'vigente' (ya solicitada/firmada/rechazada, o cambió en carrera):
  // responder según el estado real, sin contradecir.
  const { data: fresh } = await supabase
    .from("advance_offers")
    .select("status")
    .eq("id", offer.id)
    .maybeSingle();
  const status = String(fresh?.status ?? offer.status);
  logger.info("whatsapp.chatbot.no_skipped", { employeeId: employee.id, offerId: offer.id, status });

  if (status === "firmada") {
    await client.sendTextMessage(from, ALREADY_SIGNED_MESSAGE(first));
  } else if (status === "solicitada") {
    await client.sendTextMessage(from, ALREADY_REQUESTED_MESSAGE(first));
  } else {
    // Ya estaba rechazada u otro estado terminal → confirmamos sin contradecir.
    await client.sendTextMessage(from, noMessage(first));
  }
}

/** Rutea una respuesta de oferta (Sí/No) para el teléfono dado. */
export async function handleOfferReply(from: string, reply: OfferReply): Promise<void> {
  const found = await findEmployeeForPhone(from);
  if (!found) {
    logger.warn("whatsapp.chatbot.employee_not_found", { fromTail: from.slice(-4) });
    return;
  }
  if (reply === "si") await handleSi(from, found);
  else await handleNo(from, found);
}

/**
 * Procesa un mensaje entrante: si es un botón de oferta → rutea Sí/No; si es un
 * botón no reconocido o texto → responde con el fallback. Devuelve qué se hizo.
 */
export async function handleInboundMessage(
  msg: InboundMessage,
): Promise<{ handled: boolean; kind: string }> {
  const button = extractButtonReply(msg);
  if (button) {
    const reply = classifyOfferReply(button.text, button.payload);
    if (reply) {
      await handleOfferReply(msg.from, reply);
      return { handled: true, kind: reply };
    }
    await getWhatsAppClient().sendTextMessage(msg.from, FALLBACK_MESSAGE);
    return { handled: true, kind: "unknown_button" };
  }

  if (msg.type === "text") {
    await getWhatsAppClient().sendTextMessage(msg.from, FALLBACK_MESSAGE);
    return { handled: true, kind: "text_fallback" };
  }

  return { handled: false, kind: msg.type };
}
