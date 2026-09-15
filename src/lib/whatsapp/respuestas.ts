/**
 * Lo que una persona le contestó al chatbot, tal como se muestra en su
 * expediente.
 *
 * Sale de `integration_logs`: cada mensaje entrante se guarda ahí (con el
 * teléfono tachado por `redactPII`) y el chatbot anota después de quién era y
 * qué hizo con él. Esta función reduce esa fila a lo que el operador necesita
 * ver, para que el payload crudo nunca viaje al navegador.
 */
export type RespuestaDePersona = {
  id: string;
  recibidaEn: string;
  /** Tipo de mensaje de WhatsApp: text, button, interactive, audio, image… */
  tipo: string;
  /** Lo que escribió, o el texto del botón que tocó. `null` si no fue texto. */
  texto: string | null;
  /** Qué hizo el chatbot con el mensaje (`si`, `no`, `text_fallback`…), si quedó anotado. */
  interpretacion: string | null;
};

/** Alcanza para leer cualquier respuesta real; lo demás no cabe en pantalla. */
const LARGO_MAXIMO = 1000;

type FilaDeLog = {
  id: string;
  created_at: string;
  request_payload: unknown;
  response_payload: unknown;
};

function comoObjeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object" ? (valor as Record<string, unknown>) : {};
}

function cadena(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() !== "" ? valor : null;
}

export function resumirRespuesta(fila: FilaDeLog): RespuestaDePersona {
  const mensaje = comoObjeto(fila.request_payload);
  const interactivo = comoObjeto(mensaje.interactive);
  const texto =
    cadena(comoObjeto(mensaje.text).body) ??
    cadena(comoObjeto(mensaje.button).text) ??
    cadena(comoObjeto(interactivo.button_reply).title) ??
    cadena(comoObjeto(interactivo.list_reply).title);

  return {
    id: fila.id,
    recibidaEn: fila.created_at,
    tipo: cadena(mensaje.type) ?? "desconocido",
    texto: texto && texto.length > LARGO_MAXIMO ? `${texto.slice(0, LARGO_MAXIMO)}…` : texto,
    interpretacion: cadena(comoObjeto(fila.response_payload).chatbot),
  };
}
