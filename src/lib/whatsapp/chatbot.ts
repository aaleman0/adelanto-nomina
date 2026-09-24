import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getWhatsAppClient } from "@/lib/whatsapp/client";
import { variantesDeTelefono } from "@/lib/whatsapp/phone-utils";
import { parseRequestContractPayload, requestContractFromWhatsApp } from "@/lib/contracts/request-contract";
import {
  DURACION_DE_LA_VENTANA,
  pasoAlPedir,
  VENTANA_OFERTA_MS,
  ventanaDeLaPersona,
  type PasoAlPedir,
} from "@/lib/contracts/ventana-oferta";
import { DURACION_DEL_ENLACE } from "@/lib/contracts/link-ttl";
import { solicitudPrevia, type SolicitudPrevia } from "@/lib/contracts/solicitud-previa";
import { logger } from "@/lib/logger";

// Se re-exportan para quien ya los importaba desde aquí.
export { variantesDeTelefono };
export { VENTANA_OFERTA_MS } from "@/lib/contracts/ventana-oferta";

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

/**
 * Cuando solo se le devuelve el enlace que ya tenía. Antes casi no ocurría —el
 * enlace moría junto con la ventana— y se reusaba el mensaje de éxito; con un
 * enlace que vive un día, esta rama se vuelve la habitual y decirle "Generamos
 * tu contrato" cada vez le haría creer que se le están generando varios.
 */
export function reenvioDeEnlaceMessage(
  firstName: string,
  montoStr: string,
  link: string,
  expiresPhrase: string,
): string {
  const hola = firstName ? `, ${firstName}` : "";
  return (
    `Aquí está de nuevo tu enlace${hola}, el mismo de antes por ${montoStr}. Sigue sirviendo.\n\n` +
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
  `La oferta estuvo disponible por ${DURACION_DE_LA_VENTANA}. Tu empresa te avisará cuando vuelva ` +
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

/**
 * Pidió el adelanto sin que la empresa se lo haya ofrecido. No se le habla de un
 * plazo vencido —nunca tuvo uno— ni se le invita a insistir: la oferta la abre
 * la empresa cuando quiere.
 */
export const SIN_OFERTA_ABIERTA_MESSAGE =
  "Por ahora no hay un adelanto abierto para ti.\n\n" +
  "Tu empresa te avisará por este medio cuando esté disponible.";

/**
 * Contestó a una oferta que ya fue reemplazada por un ciclo nuevo. No se le
 * genera nada: su "Sí" era por otro monto. Se le dice dónde está el vigente en
 * vez de callar, porque el mensaje nuevo ya está en su chat.
 */
export const RESPUESTA_DE_OTRA_OFERTA_MESSAGE =
  "Tu empresa actualizó tu adelanto 🔄\n\n" +
  "Ese mensaje era de la oferta anterior. Busca el más reciente en esta " +
  "conversación y contesta ahí para pedirlo.";

/** No se pudo comprobar la ventana. Es una falla nuestra, no un plazo vencido. */
export const VENTANA_SIN_VERIFICAR_MESSAGE =
  "😕 No pudimos revisar tu solicitud en este momento. Inténtalo de nuevo en unos minutos.";

/** Pidió a tiempo, pero su enlace de firma ya venció. No se le genera otro fuera de la ventana. */
export const ENLACE_VENCIDO_MESSAGE =
  "Tu enlace para firmar ya venció ⏳\n\n" +
  `Los enlaces duran ${DURACION_DEL_ENLACE}. Tu empresa te avisará cuando el adelanto vuelva a estar disponible.`;

/** Pidió a tiempo, pero el contrato no se pudo preparar. No se le promete un enlace que nunca tuvo. */
export const CONTRATO_NO_PREPARADO_MESSAGE =
  "😕 Tu solicitud quedó registrada, pero no pudimos preparar tu contrato.\n\n" +
  "Tu empresa lo va a revisar.";

export const SOLICITUD_EN_PROCESO_MESSAGE = (firstName: string) =>
  `Ya solicitaste tu adelanto${firstName ? `, ${firstName}` : ""}. Tu empresa te avisará si hace falta algo más.`;

/**
 * Qué contestarle a quien quiere pedir el adelanto, según el paso que toca.
 * `null` = que siga y se le genere el contrato. Cada motivo dice la verdad sobre
 * POR QUÉ no puede: no es lo mismo llegar tarde que no haber recibido nunca la
 * oferta, y ninguna de las dos es una caída de la base. Quien ya pidió se
 * atiende aparte, mirando lo que de verdad tiene.
 */
export function mensajeAntesDePedir(paso: Exclude<PasoAlPedir, "ya_pidio">): string | null {
  if (paso === "pedir") return null;
  if (paso === "fuera_de_plazo") return VENTANA_CERRADA_MESSAGE;
  if (paso === "sin_envio") return SIN_OFERTA_ABIERTA_MESSAGE;
  return VENTANA_SIN_VERIFICAR_MESSAGE;
}

/**
 * Qué contestarle a quien ya pidió y no tiene un enlace vigente que entregarle.
 * Nunca le promete un enlace que no existe ni lo invita a insistir.
 */
export function mensajeParaQuienYaPidio(
  previa: Exclude<SolicitudPrevia, "enlace_vigente">,
  primerNombre: string,
): string {
  if (previa === "enlace_vencido") return ENLACE_VENCIDO_MESSAGE;
  if (previa === "fallo") return CONTRATO_NO_PREPARADO_MESSAGE;
  if (previa === "sin_verificar") return VENTANA_SIN_VERIFICAR_MESSAGE;
  return SOLICITUD_EN_PROCESO_MESSAGE(primerNombre);
}

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
 * "hola" de la mañana confunde a quien ya olvidó que escribió.
 *
 * Se descarta en silencio: si sigue interesada, vuelve a tocar el botón y se le
 * atiende con la hora correcta.
 *
 * Son DOS cortes, porque los dos tipos de mensaje se estropean por motivos
 * distintos:
 *
 * - Un "hola", una foto o un botón que no se reconoce solo se contestan si
 *   siguen siendo recientes: media hora. Contestar de madrugada a algo de la
 *   mañana confunde a quien ya olvidó que escribió, y no hay nada que perder por
 *   no contestarlo.
 * - Un "Sí" o un "No" compiten con la VENTANA para pedir, y ahí el corte corto
 *   hace daño: tiraría en silencio una solicitud que la ventana sí acepta, y la
 *   persona se quedaría sin adelanto y sin respuesta, sin saber por qué. Quien
 *   manda en esos es la ventana, que ya juzga con la hora en que la persona
 *   contestó (`momentoDeLaRespuesta`) y falla en cerrado; este corte solo tiene
 *   que atrapar lo que ya no cabría en ella por ningún camino.
 *
 * Mientras la ventana duró dos horas los dos cortes coincidían en la práctica y
 * bastaba uno.
 */
export const MAX_ANTIGUEDAD_MS = 30 * 60 * 1000;
export const MAX_ANTIGUEDAD_RESPUESTA_MS = VENTANA_OFERTA_MS;

export function mensajeDemasiadoViejo(
  timestamp: string | undefined,
  ahora = Date.now(),
  maximo = MAX_ANTIGUEDAD_MS,
): boolean {
  if (!timestamp) return false; // Sin marca de tiempo no se puede juzgar: se atiende.
  const enviado = Number(timestamp) * 1000;
  if (!Number.isFinite(enviado) || enviado <= 0) return false;
  return ahora - enviado > maximo;
}

/**
 * ¿Esta respuesta es de la oferta que hay ahora, o de una anterior?
 *
 * Reimportar el ciclo INSERTA una oferta nueva y reemplaza la anterior
 * (`imports/apply.ts`), casi siempre con otro monto. Un "Sí" que la persona tocó
 * ayer, contra la oferta vieja, y que Meta nos entrega tarde, generaría un
 * contrato por una cantidad que nunca vio: consintió $3,000 y firma $8,000.
 *
 * Con el corte de antigüedad en media hora esto era casi imposible. Con un día
 * de tolerancia cabe un ciclo entero en medio, así que hay que mirarlo.
 *
 * Sin fecha de oferta legible no se bloquea: es un dato nuestro que falta, no una
 * señal de que la persona se equivocó.
 */
export function respuestaEsDeOtraOferta(
  ofertaCreadaEn: string | null | undefined,
  pidioEn: number,
): boolean {
  if (!ofertaCreadaEn) return false;
  const creada = new Date(ofertaCreadaEn).getTime();
  if (!Number.isFinite(creada)) return false;
  return pidioEn < creada;
}

/**
 * Cuándo pidió la persona, para medir la ventana. Es la marca que pone Meta al
 * recibir el mensaje, no la hora en que lo procesamos: un "Sí" dado a tiempo que
 * nos llega tarde por un reintento no debe encontrarse el plazo cerrado. Nunca
 * en el futuro; sin marca legible, ahora.
 */
export function momentoDeLaRespuesta(timestamp: string | undefined, ahora = Date.now()): number {
  const enviado = Number(timestamp) * 1000;
  return Number.isFinite(enviado) && enviado > 0 ? Math.min(enviado, ahora) : ahora;
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
  offer: {
    id: string;
    status: string;
    is_eligible: boolean;
    monto_prestamo_autorizado: number;
    /** Para saber si una respuesta rezagada es de esta oferta o de la anterior. */
    created_at: string | null;
  } | null;
};

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
      .select("id, status, is_eligible, monto_prestamo_autorizado, created_at")
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
    // Tiempo real de expiración, no el plazo nominal: si el intento se reusó le
    // queda menos y el mensaje debe decir la verdad. Usa el expires_at del
    // resultado, que es el mismo que enforza /firmar y EasyLex.
    const expiresPhrase = result.expires_at_formatted
      ? `El enlace vence el ${result.expires_at_formatted}.`
      : `El enlace vence en ${DURACION_DEL_ENLACE}.`;
    // Qué se le dice depende de si de verdad se generó algo o se le devolvió lo
    // que ya tenía, NO de la puerta por la que entró: el doble toque dentro de
    // la ventana también reusa el enlace, y ahí el paso sigue siendo "pedir".
    const armarMensaje = result.link_reusado ? reenvioDeEnlaceMessage : siSuccessMessage;
    text = armarMensaje(
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

/**
 * Rutea una respuesta de oferta (Sí/No) para el teléfono dado. Devuelve de qué
 * empleado era, para dejar el mensaje ligado a su expediente.
 */
export async function handleOfferReply(
  from: string,
  reply: OfferReply,
  pidioEn = Date.now(),
): Promise<string | null> {
  const found = await findEmployeeForPhone(from);
  if (!found) {
    logger.warn("whatsapp.chatbot.employee_not_found", { fromTail: from.slice(-4) });
    await getWhatsAppClient().sendTextMessage(from, UNKNOWN_NUMBER_MESSAGE);
    return null;
  }

  // Antes que nada: ¿contestó a ESTA oferta o a la anterior? Va delante del "No"
  // a propósito — un rechazo rezagado del ciclo viejo dejaría la oferta nueva en
  // `rechazada` y la persona perdería un adelanto que nunca vio.
  if (respuestaEsDeOtraOferta(found.offer?.created_at, pidioEn)) {
    logger.warn("whatsapp.chatbot.respuesta_de_otra_oferta", {
      employeeId: found.employee.id,
      offerId: found.offer?.id,
      ofertaCreadaEn: found.offer?.created_at,
      pidioEn: new Date(pidioEn).toISOString(),
      reply,
    });
    await getWhatsAppClient().sendTextMessage(from, RESPUESTA_DE_OTRA_OFERTA_MESSAGE);
    return found.employee.id;
  }

  if (reply === "no") {
    // La ventana solo limita PEDIR. Rechazar fuera de plazo es inofensivo y no
    // tiene sentido negárselo a quien se tomó la molestia de contestar.
    await handleNo(from, found);
    return found.employee.id;
  }

  if (!found.offer) {
    // Sin oferta no hay plazo que discutir: "el plazo cerró" le haría creer que
    // llegó tarde a algo que nunca existió.
    await getWhatsAppClient().sendTextMessage(from, NO_OFFER_MESSAGE);
    return found.employee.id;
  }

  const ventana = await ventanaDeLaPersona(found.employee.id, pidioEn);
  const paso = pasoAlPedir(found.offer.status, ventana);

  if (paso === "ya_pidio") {
    // Ya pidió dentro del plazo: no se le genera otro contrato. Si tiene un
    // enlace vigente —el suyo, o uno que le regeneró un operador— se le entrega:
    // handleSi lo reusa y no llama a EasyLex; el mensaje sale como reenvío solo
    // porque el resultado viene reusado, no por haber entrado por aquí.
    const previa = await solicitudPrevia(found.offer.id);
    if (previa === "enlace_vigente") {
      await handleSi(from, found);
      return found.employee.id;
    }
    logger.info("whatsapp.chatbot.no_puede_pedir", {
      employeeId: found.employee.id,
      offerId: found.offer.id,
      paso,
      previa,
    });
    await getWhatsAppClient().sendTextMessage(
      from,
      mensajeParaQuienYaPidio(previa, firstNameOf(found.employee.nombre)),
    );
    return found.employee.id;
  }

  const aviso = mensajeAntesDePedir(paso);
  if (aviso) {
    logger.info("whatsapp.chatbot.no_puede_pedir", {
      employeeId: found.employee.id,
      offerId: found.offer.id,
      paso,
    });
    await getWhatsAppClient().sendTextMessage(from, aviso);
    return found.employee.id;
  }

  await handleSi(from, found);
  return found.employee.id;
}

/** Qué pasó con un mensaje entrante y de quién era, si se supo. */
export type InboundOutcome = { handled: boolean; kind: string; employeeId: string | null };

/**
 * De quién es un mensaje que no llevó a ninguna acción. Solo sirve para ligarlo
 * a su expediente, así que un fallo aquí no puede impedir la respuesta: se
 * devuelve null y el mensaje queda guardado, aunque sin dueño.
 */
export async function quienEscribio(from: string): Promise<string | null> {
  try {
    return (await findEmployeeForPhone(from))?.employee.id ?? null;
  } catch (err) {
    logger.warn("whatsapp.chatbot.remitente_no_identificado", {
      fromTail: from.slice(-4),
      detalle: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Procesa un mensaje entrante: si es un botón de oferta → rutea Sí/No; si es un
 * botón no reconocido o texto → responde con el fallback. Devuelve qué se hizo y
 * de quién era, para que el mensaje quede ligado a su expediente.
 */
export async function handleInboundMessage(msg: InboundMessage): Promise<InboundOutcome> {
  // Se clasifica ANTES de mirar la antigüedad, porque el corte depende de qué
  // sea: una respuesta de oferta se atiende mientras la ventana la aceptaría; lo
  // demás, solo si sigue reciente. Ver MAX_ANTIGUEDAD_MS.
  const button = extractButtonReply(msg);
  const respuestaDeOferta = button
    ? classifyOfferReply(button.text, button.payload)
    : msg.type === "text"
      ? classifyTextReply(msg.text?.body)
      : null;
  const maximo = respuestaDeOferta ? MAX_ANTIGUEDAD_RESPUESTA_MS : MAX_ANTIGUEDAD_MS;

  if (mensajeDemasiadoViejo(msg.timestamp, Date.now(), maximo)) {
    logger.info("whatsapp.chatbot.mensaje_viejo_descartado", {
      id: msg.id,
      esRespuestaDeOferta: Boolean(respuestaDeOferta),
      enviadoHace: msg.timestamp
        ? Math.round((Date.now() - Number(msg.timestamp) * 1000) / 60000) + " min"
        : "?",
    });
    return { handled: false, kind: "demasiado_viejo", employeeId: await quienEscribio(msg.from) };
  }

  if (button) {
    const reply = classifyOfferReply(button.text, button.payload);
    if (reply) {
      return { handled: true, kind: reply, employeeId: await handleOfferReply(msg.from, reply, momentoDeLaRespuesta(msg.timestamp)) };
    }
    await getWhatsAppClient().sendTextMessage(msg.from, FALLBACK_MESSAGE);
    return { handled: true, kind: "unknown_button", employeeId: await quienEscribio(msg.from) };
  }

  if (msg.type === "text") {
    // Mucha gente contesta ESCRIBIENDO en vez de tocar el botón, sobre todo si
    // el mensaje ya lleva rato en el chat y los botones quedaron arriba. Se
    // atiende igual que un toque, pero solo con frases inequívocas.
    const escrito = classifyTextReply(msg.text?.body);
    if (escrito) {
      return {
        handled: true,
        kind: `${escrito}_texto`,
        employeeId: await handleOfferReply(msg.from, escrito, momentoDeLaRespuesta(msg.timestamp)),
      };
    }
    await getWhatsAppClient().sendTextMessage(msg.from, FALLBACK_MESSAGE);
    return { handled: true, kind: "text_fallback", employeeId: await quienEscribio(msg.from) };
  }

  // Cualquier otro tipo (nota de voz, imagen, sticker, ubicación, documento…):
  // se contesta con la guía en vez de dejar a la persona esperando.
  await getWhatsAppClient().sendTextMessage(msg.from, UNSUPPORTED_MESSAGE);
  return { handled: true, kind: `no_soportado:${msg.type}`, employeeId: await quienEscribio(msg.from) };
}
