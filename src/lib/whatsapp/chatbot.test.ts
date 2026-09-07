import { describe, it, expect } from "vitest";
import {
  classifyOfferReply,
  classifyTextReply,
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
