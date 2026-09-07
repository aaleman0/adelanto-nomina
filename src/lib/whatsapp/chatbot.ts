import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getWhatsAppClient } from "@/lib/whatsapp/client";
import { normalizePhoneFromCsv } from "@/lib/whatsapp/phone-utils";
import { parseRequestContractPayload, requestContractFromWhatsApp } from "@/lib/contracts/request-contract";
import { LINK_TTL_HOURS } from "@/lib/contracts/link-ttl";
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
  /** Momento en que la PERSONA lo envió, en segundos (lo pone Meta). */
  timestamp?: string;
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
export const VENTANA_CERRADA_MESSAGE =
  "El plazo para pedir este adelanto ya cerró ⏳\n\n" +
  "La oferta estuvo disponible por 2 horas. Tu empresa te avisará cuando vuelva " +
  "a estar abierta.";

export const NO_OFFER_MESSAGE =
  "Por ahora no tienes un adelanto disponible para solicitar. Si crees que es un error, contacta a tu empresa.";
export const GENERATION_ERROR_MESSAGE =
  "😕 Tuvimos un problema al generar tu contrato. Inténtalo de nuevo en unos minutos o contacta a tu empresa.";
export const FALLBACK_MESSAGE =
  "No entendí tu respuesta 🤔\n\n" +
  "Toca uno de los botones de arriba 👆, o escríbeme *SÍ* si quieres tu adelanto, " +
  "o *NO* si no lo quieres por ahora.";

/**
 * Para lo que no es texto ni botón (nota de voz, foto, sticker, ubicación…).
 * Antes estos mensajes se ignoraban en silencio y la persona quedaba esperando
 * una respuesta que nunca llegaba.
 */
export const UNSUPPORTED_MESSAGE =
  "Por aquí solo puedo leer texto 🙏\n\n" +
  "Escríbeme *SÍ* si quieres tu adelanto, o *NO* si no lo quieres por ahora.";

/**
 * El número no corresponde a ningún empleado registrado. Se responde igual —en
 * vez de callar— porque el silencio deja a la persona sin saber si el mensaje
 * llegó, y porque muchas veces es un empleado real cuyo teléfono quedó mal
 * capturado: el mensaje le dice a quién acudir.
 */
export const UNKNOWN_NUMBER_MESSAGE =
  "No encontramos tu número en el sistema 😕\n\n" +
  "Puede que esté registrado de otra forma. Contacta a tu empresa para revisarlo.";

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

/**
 * Clasifica un mensaje ESCRITO (no un botón) como sí/no.
 *
 * Es deliberadamente ESTRICTO, al revés que `classifyOfferReply`: el texto de un
 * botón es exacto y controlado, pero el texto libre no. Una coincidencia laxa
 * haría que "no sé" se lea como un rechazo y le cancele el adelanto a alguien
 * que solo estaba dudando —una acción con consecuencia real—. Por eso solo se
 * aceptan frases completas de la lista; cualquier otra cosa cae al mensaje de
 * ayuda, que no cambia nada.
 */
const TEXTO_SI = new Set([
  "si", "si lo quiero", "si quiero", "lo quiero", "si acepto", "acepto",
  "claro", "claro que si", "si por favor", "dale", "va", "de acuerdo",
]);

const TEXTO_NO = new Set([
  "no", "no gracias", "no lo quiero", "no quiero", "no me interesa",
  "no por ahora", "ahora no", "no acepto",
]);

export function classifyTextReply(body?: string | null): OfferReply | null {
  // Se normaliza igual que los botones (sin acentos, minúsculas) y además se
  // quita la puntuación y se colapsan espacios, para que "¡Sí, lo quiero!"
  // y "si lo quiero" sean la misma frase.
  const t = strip(body).replace(/[¡!¿?.,;:]/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return null;
  if (TEXTO_SI.has(t)) return "si";
  if (TEXTO_NO.has(t)) return "no";
  return null;
}

/**
 * Cuánto puede tardar un mensaje en llegar y seguir siendo relevante.
 *
 * Meta reintenta la entrega cuando el webhook no responde —por ejemplo durante
 * un redespliegue—, y se han visto entregas con 4 y 7 horas de retraso. Actuar
 * sobre un mensaje tan viejo hace daño: contestar una guía de madrugada por un
 * "hola" de la mañana confunde, y peor, un "Sí, lo quiero" rezagado genera un
 * contrato —gastando una firma de EasyLex— con un enlace de 2 horas que vence
 * mientras la persona duerme y nunca lo ve.
 *
 * Se descarta en silencio: si la persona sigue interesada, vuelve a tocar el
 * botón y recibe un enlace fresco que sí alcanza a usar.
 *
 * Media hora es holgado para un reintento normal de Meta y sigue muy por debajo
 * de las 2 horas que dura el enlace de firma: un mensaje más viejo que eso
 * generaría un contrato que nace casi vencido.
 */
export const MAX_ANTIGUEDAD_MS = 30 * 60 * 1000;

export function mensajeDemasiadoViejo(
  timestamp: string | undefined,
  ahora = Date.now(),
): boolean {
  if (!timestamp) return false; // Sin marca de tiempo no se puede juzgar: se atiende.
  const enviado = Number(timestamp) * 1000;
  if (!Number.isFinite(enviado) || enviado <= 0) return false;
  return ahora - enviado > MAX_ANTIGUEDAD_MS;
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

/**
 * Todas las formas en que un mismo número mexicano puede estar guardado.
 *
 * WhatsApp manda SIEMPRE `52` + `1` + 10 dígitos, pero en la base conviven las
 * dos convenciones: con el `1` (móvil) y sin él. No es un detalle menor —hoy
 * uno de cada tres empleados está guardado sin el `1`—, y buscar por igualdad
 * exacta los dejaba fuera: respondían al chatbot y el sistema decía no
 * conocerlos. Se buscan ambas variantes en vez de exigir que los datos estén
 * perfectos.
 */
export function variantesDeTelefono(from: string): string[] {
  const digitos = (normalizePhoneFromCsv(from) ?? from).replace(/\D/g, "");
  const variantes = new Set<string>([digitos]);

  if (digitos.startsWith("521") && digitos.length === 13) {
    variantes.add("52" + digitos.slice(3)); // sin el 1
  } else if (digitos.startsWith("52") && digitos.length === 12) {
    variantes.add("521" + digitos.slice(2)); // con el 1
  }
  return [...variantes];
}

async function findEmployeeForPhone(from: string): Promise<FoundEmployee | null> {
  const supabase = getSupabaseAdmin();
  const posibles = variantesDeTelefono(from);

  const { data: emps, error } = await supabase
    .from("employees")
    .select("id, rfc, nombre, telefono_normalizado")
    .in("telefono_normalizado", posibles);

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

/**
 * ¿Sigue abierta la ventana para pedir el adelanto?
 *
 * Regla del negocio: la ventana la abre la EMPRESA al enviar la oferta y dura lo
 * mismo que el enlace de firma. Fuera de ella el empleado no puede pedirlo por su
 * cuenta —la idea es que el adelanto se ofrezca cuando la empresa quiere, no que
 * quede disponible de forma permanente para pedirlo en cualquier momento—.
 *
 * Se mide desde el ENVÍO registrado (`bulk_contract_offer`), no desde la oferta:
 * una oferta puede llevar semanas vigente en la base sin habérsele enviado.
 *
 * Si no hay registro de envío, se deja pasar: puede ser un alta manual o una
 * prueba, y bloquear ahí dejaría a alguien sin su adelanto por un hueco de datos.
 * Queda en el log para poder detectarlo.
 */
export const VENTANA_OFERTA_MS = LINK_TTL_HOURS * 60 * 60 * 1000;

async function ventanaSigueAbierta(employeeId: string, offerId: string | null): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  let q = supabase
    .from("whatsapp_contract_messages")
    .select("created_at")
    .eq("employee_id", employeeId)
    .eq("message_type", "bulk_contract_offer")
    .order("created_at", { ascending: false })
    .limit(1);
  if (offerId) q = q.eq("offer_id", offerId);

  const { data } = await q;
  const enviadoEn = (data ?? [])[0]?.created_at as string | undefined;

  if (!enviadoEn) {
    logger.info("whatsapp.chatbot.sin_registro_de_envio", { employeeId });
    return true;
  }
  return Date.now() - new Date(enviadoEn).getTime() <= VENTANA_OFERTA_MS;
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
    await getWhatsAppClient().sendTextMessage(from, UNKNOWN_NUMBER_MESSAGE);
    return;
  }
  if (reply === "si") {
    // La ventana solo limita PEDIR. Rechazar fuera de plazo es inofensivo y no
    // tiene sentido negárselo a quien se tomó la molestia de contestar.
    if (!(await ventanaSigueAbierta(found.employee.id, found.offer?.id ?? null))) {
      logger.info("whatsapp.chatbot.ventana_cerrada", { employeeId: found.employee.id });
      await getWhatsAppClient().sendTextMessage(from, VENTANA_CERRADA_MESSAGE);
      return;
    }
    await handleSi(from, found);
  } else {
    await handleNo(from, found);
  }
}

/**
 * Procesa un mensaje entrante: si es un botón de oferta → rutea Sí/No; si es un
 * botón no reconocido o texto → responde con el fallback. Devuelve qué se hizo.
 */
export async function handleInboundMessage(
  msg: InboundMessage,
): Promise<{ handled: boolean; kind: string }> {
  if (mensajeDemasiadoViejo(msg.timestamp)) {
    logger.info("whatsapp.chatbot.mensaje_viejo_descartado", {
      id: msg.id,
      enviadoHace: msg.timestamp
        ? Math.round((Date.now() - Number(msg.timestamp) * 1000) / 60000) + " min"
        : "?",
    });
    return { handled: false, kind: "demasiado_viejo" };
  }

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
    // Mucha gente contesta ESCRIBIENDO en vez de tocar el botón, sobre todo si
    // el mensaje ya lleva rato en el chat y los botones quedaron arriba. Se
    // atiende igual que un toque, pero solo con frases inequívocas.
    const escrito = classifyTextReply(msg.text?.body);
    if (escrito) {
      await handleOfferReply(msg.from, escrito);
      return { handled: true, kind: `${escrito}_texto` };
    }
    await getWhatsAppClient().sendTextMessage(msg.from, FALLBACK_MESSAGE);
    return { handled: true, kind: "text_fallback" };
  }

  // Cualquier otro tipo (nota de voz, imagen, sticker, ubicación, documento…):
  // se contesta con la guía en vez de dejar a la persona esperando.
  await getWhatsAppClient().sendTextMessage(msg.from, UNSUPPORTED_MESSAGE);
  return { handled: true, kind: `no_soportado:${msg.type}` };
}
