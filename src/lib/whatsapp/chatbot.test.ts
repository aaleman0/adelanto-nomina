import { describe, it, expect } from "vitest";
import {
  classifyOfferReply,
  classifyTextReply,
  FALLBACK_MESSAGE,
  UNSUPPORTED_MESSAGE,
  UNKNOWN_NUMBER_MESSAGE,
  variantesDeTelefono,
  mensajeDemasiadoViejo,
  VENTANA_OFERTA_MS,
  VENTANA_CERRADA_MESSAGE,
  extractButtonReply,
  siSuccessMessage,
  noMessage,
  type InboundMessage,
} from "./chatbot";

describe("classifyOfferReply", () => {
  it("reconoce los textos de botón exactos", () => {
    expect(classifyOfferReply("Sí, lo quiero")).toBe("si");
    expect(classifyOfferReply("No, gracias")).toBe("no");
  });

  it("es tolerante a acentos y mayúsculas", () => {
    expect(classifyOfferReply("SI, LO QUIERO")).toBe("si");
    expect(classifyOfferReply("no, gracias")).toBe("no");
    expect(classifyOfferReply("Sí lo quiero")).toBe("si");
  });

  it("usa el payload si viene", () => {
    expect(classifyOfferReply(null, "SI_ADELANTO")).toBe("si");
    expect(classifyOfferReply(null, "NO_ADELANTO")).toBe("no");
  });

  it("no confunde 'No, gracias' con sí", () => {
    expect(classifyOfferReply("No, gracias")).not.toBe("si");
  });

  it("devuelve null para texto no reconocido", () => {
    expect(classifyOfferReply("hola")).toBeNull();
    expect(classifyOfferReply("cuánto es?")).toBeNull();
    expect(classifyOfferReply("")).toBeNull();
    expect(classifyOfferReply(undefined, undefined)).toBeNull();
  });
});

describe("extractButtonReply", () => {
  const base = { id: "wamid.1", from: "5218713330257" };

  it("extrae de un botón de plantilla (type button)", () => {
    const msg: InboundMessage = { ...base, type: "button", button: { text: "Sí, lo quiero", payload: "SI_ADELANTO" } };
    expect(extractButtonReply(msg)).toEqual({ text: "Sí, lo quiero", payload: "SI_ADELANTO" });
  });

  it("extrae de un mensaje interactivo (button_reply)", () => {
    const msg: InboundMessage = {
      ...base,
      type: "interactive",
      interactive: { type: "button_reply", button_reply: { id: "no_id", title: "No, gracias" } },
    };
    expect(extractButtonReply(msg)).toEqual({ text: "No, gracias", payload: "no_id" });
  });

  it("devuelve null para un mensaje de texto", () => {
    const msg: InboundMessage = { ...base, type: "text", text: { body: "hola" } };
    expect(extractButtonReply(msg)).toBeNull();
  });
});

describe("mensajes", () => {
  it("el mensaje de éxito incluye monto, link y el aviso de expiración", () => {
    const m = siSuccessMessage(
      "Angel",
      "$4,000.00",
      "https://easylex.com/documento/firma/sig-abc",
      "El enlace vence en 2 horas.",
    );
    expect(m).toContain("Angel");
    expect(m).toContain("$4,000.00");
    expect(m).toContain("vence");
    expect(m).toContain("https://easylex.com/documento/firma/sig-abc");
  });

  it("el mensaje de éxito funciona sin nombre", () => {
    const m = siSuccessMessage("", "$4,000.00", "https://x/y", "El enlace vence en 2 horas.");
    expect(m).toContain("¡Listo!");
    expect(m).not.toContain(", !");
  });

  it("el mensaje de 'No' es corto y sin la línea de reconsideración", () => {
    const m = noMessage("Angel");
    expect(m).toContain("Gracias por confirmar, Angel");
    expect(m).not.toContain("cambias de opinión");
  });
});

/**
 * Respuestas ESCRITAS. Lo crítico aquí no es que reconozca "sí": es que NO
 * reconozca de más. Clasificar mal un "no sé" como rechazo le cancelaría el
 * adelanto a alguien que solo estaba dudando.
 */
describe("classifyTextReply", () => {
  it("acepta las formas comunes de decir que sí", () => {
    ["si", "Sí", "SI", "sí, lo quiero", "Si lo quiero", "acepto", "claro", "dale", "de acuerdo"]
      .forEach((t) => expect(classifyTextReply(t), t).toBe("si"));
  });

  it("acepta las formas comunes de decir que no", () => {
    ["no", "No", "no gracias", "No, gracias", "no quiero", "no me interesa", "ahora no"]
      .forEach((t) => expect(classifyTextReply(t), t).toBe("no"));
  });

  it("NO confunde la duda con un rechazo (el caso peligroso)", () => {
    ["no sé", "no se", "no entiendo", "no me llegó", "no puedo abrir el link", "no sé qué es esto"]
      .forEach((t) => expect(classifyTextReply(t), t).toBeNull());
  });

  it("NO confunde una pregunta con una aceptación", () => {
    ["si me lo dan cuándo lo pagan", "de cuánto es", "hola", "quien habla", "?"]
      .forEach((t) => expect(classifyTextReply(t), t).toBeNull());
  });

  it("ignora signos y espacios de más", () => {
    expect(classifyTextReply("  ¡Sí!  ")).toBe("si");
    expect(classifyTextReply("No, gracias.")).toBe("no");
  });

  it("devuelve null con texto vacío", () => {
    expect(classifyTextReply("")).toBeNull();
    expect(classifyTextReply(null)).toBeNull();
    expect(classifyTextReply(undefined)).toBeNull();
  });
});

/**
 * Nadie se queda sin respuesta. El chatbot atiende a gente con prisa desde el
 * celular: si manda una nota de voz o algo que no entendemos, el silencio la
 * deja sin saber si su mensaje llegó.
 */
describe("mensajes de la conversación", () => {
  it("el mensaje de ayuda ofrece AMBAS formas de responder (botón y escrito)", () => {
    expect(FALLBACK_MESSAGE).toMatch(/bot/i);   // menciona los botones
    expect(FALLBACK_MESSAGE).toMatch(/SÍ/);     // y que puede escribir
    expect(FALLBACK_MESSAGE).toMatch(/NO/);
  });

  it("hay respuesta para lo que no es texto (nota de voz, foto…)", () => {
    expect(UNSUPPORTED_MESSAGE).toMatch(/SÍ/);
    expect(UNSUPPORTED_MESSAGE).toMatch(/NO/);
    expect(UNSUPPORTED_MESSAGE.length).toBeGreaterThan(20);
  });

  it("hay respuesta para un número que no está registrado, y dice qué hacer", () => {
    expect(UNKNOWN_NUMBER_MESSAGE).toMatch(/empresa/i);
  });

  it("ningún mensaje al empleado usa jerga técnica", () => {
    const todos = [FALLBACK_MESSAGE, UNSUPPORTED_MESSAGE, UNKNOWN_NUMBER_MESSAGE];
    for (const m of todos) {
      expect(m).not.toMatch(/webhook|payload|null|undefined|error 4\d\d|API/i);
    }
  });
});

/**
 * Uno de cada tres empleados está guardado SIN el "1" de móvil mexicano, y
 * WhatsApp siempre manda CON el "1". Buscar por igualdad exacta los dejaba
 * fuera: respondían y el sistema decía no conocerlos.
 */
describe("variantesDeTelefono", () => {
  it("desde el formato de WhatsApp busca también el guardado sin el 1", () => {
    const v = variantesDeTelefono("5218713330257");
    expect(v).toContain("5218713330257");
    expect(v).toContain("528713330257");
  });

  it("desde el formato sin el 1 busca también el de WhatsApp", () => {
    const v = variantesDeTelefono("528713330257");
    expect(v).toContain("528713330257");
    expect(v).toContain("5218713330257");
  });

  it("los dos formatos del MISMO número producen el mismo par", () => {
    expect(new Set(variantesDeTelefono("5218713330257")))
      .toEqual(new Set(variantesDeTelefono("528713330257")));
  });

  it("no inventa variantes para números que no son de México", () => {
    const v = variantesDeTelefono("14155552671"); // Estados Unidos
    expect(v).toEqual(["14155552671"]);
  });

  it("tolera el número con signos o espacios", () => {
    expect(variantesDeTelefono("+52 1 871 333 0257")).toContain("5218713330257");
  });
});

/**
 * Meta reintenta la entrega cuando el webhook no responde, y se vieron entregas
 * con 4 y 7 horas de retraso tras un redespliegue. Actuar sobre un mensaje tan
 * viejo confunde a la persona y, en el caso del "Sí", gasta una firma de EasyLex
 * en un enlace que vence mientras duerme. El corte son 30 minutos: holgado para
 * un reintento normal y muy por debajo de las 2 horas que dura el enlace.
 */
describe("mensajeDemasiadoViejo", () => {
  const ahora = new Date("2026-09-07T12:00:00Z").getTime();
  const haceMinutos = (m: number) => String(Math.floor((ahora - m * 60_000) / 1000));

  it("atiende lo reciente", () => {
    expect(mensajeDemasiadoViejo(haceMinutos(0), ahora)).toBe(false);
    expect(mensajeDemasiadoViejo(haceMinutos(15), ahora)).toBe(false);
    expect(mensajeDemasiadoViejo(haceMinutos(29), ahora)).toBe(false);
  });

  it("descarta lo que rebasa la media hora", () => {
    expect(mensajeDemasiadoViejo(haceMinutos(31), ahora)).toBe(true);
    expect(mensajeDemasiadoViejo(haceMinutos(90), ahora)).toBe(true);
    expect(mensajeDemasiadoViejo(haceMinutos(60 * 4), ahora)).toBe(true);  // el caso real
    expect(mensajeDemasiadoViejo(haceMinutos(60 * 7), ahora)).toBe(true);  // el otro caso real
  });

  it("ante la duda, atiende: sin marca de tiempo o con una ilegible", () => {
    expect(mensajeDemasiadoViejo(undefined, ahora)).toBe(false);
    expect(mensajeDemasiadoViejo("no-es-un-numero", ahora)).toBe(false);
    expect(mensajeDemasiadoViejo("", ahora)).toBe(false);
  });

  it("un reloj adelantado no descarta el mensaje", () => {
    expect(mensajeDemasiadoViejo(String(Math.floor((ahora + 60_000) / 1000)), ahora)).toBe(false);
  });
});

/**
 * La ventana la abre la EMPRESA al enviar la oferta y dura lo mismo que el
 * enlace. Fuera de ella el empleado no puede pedir el adelanto por su cuenta:
 * la idea del cliente es ofrecerlo cuando él quiere, no dejarlo disponible de
 * forma permanente.
 */
describe("ventana para pedir el adelanto", () => {
  it("dura lo mismo que el enlace de firma (una sola fuente de verdad)", () => {
    expect(VENTANA_OFERTA_MS).toBe(2 * 60 * 60 * 1000);
  });

  it("el aviso de ventana cerrada no invita a pedirlo por su cuenta", () => {
    expect(VENTANA_CERRADA_MESSAGE).toMatch(/empresa/i);
    expect(VENTANA_CERRADA_MESSAGE).not.toMatch(/responde|escribe|toca/i);
  });

  it("el aviso explica el plazo sin jerga", () => {
    expect(VENTANA_CERRADA_MESSAGE).toMatch(/2 horas/);
    expect(VENTANA_CERRADA_MESSAGE).not.toMatch(/webhook|token|API|null/i);
  });
});
