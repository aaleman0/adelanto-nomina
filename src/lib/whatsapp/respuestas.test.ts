import { describe, expect, it } from "vitest";
import { resumirRespuesta } from "./respuestas";

const base = { id: "log-1", created_at: "2026-09-07T17:55:01Z" };

/**
 * Lo que la persona contestó es lo que el operador necesita leer para saber si
 * hace falta intervenir. El caso que motivó esto: una respuesta automática de
 * WhatsApp Business que, sin texto a la vista, pareció una solicitud perdida.
 */
describe("resumirRespuesta", () => {
  it("un texto escrito conserva lo que dijo y cómo lo tomó el sistema", () => {
    expect(
      resumirRespuesta({
        ...base,
        request_payload: {
          type: "text",
          from: "[redacted]",
          text: { body: "Gracias por comunicarte ¿Cómo podemos ayudarte?" },
        },
        response_payload: { chatbot: "text_fallback" },
      }),
    ).toEqual({
      id: "log-1",
      recibidaEn: base.created_at,
      tipo: "text",
      texto: "Gracias por comunicarte ¿Cómo podemos ayudarte?",
      interpretacion: "text_fallback",
    });
  });

  it("un botón de plantilla se lee por su texto", () => {
    const r = resumirRespuesta({
      ...base,
      request_payload: { type: "button", button: { text: "No, gracias", payload: "NO_ADELANTO" } },
      response_payload: { chatbot: "no" },
    });
    expect(r.texto).toBe("No, gracias");
    expect(r.interpretacion).toBe("no");
  });

  it("un botón interactivo también", () => {
    const r = resumirRespuesta({
      ...base,
      request_payload: { type: "interactive", interactive: { button_reply: { id: "si", title: "Sí, lo quiero" } } },
      response_payload: {},
    });
    expect(r.texto).toBe("Sí, lo quiero");
  });

  it("una nota de voz no trae texto", () => {
    const r = resumirRespuesta({ ...base, request_payload: { type: "audio" }, response_payload: {} });
    expect(r.tipo).toBe("audio");
    expect(r.texto).toBeNull();
  });

  it("los mensajes que nunca se anotaron no inventan interpretación", () => {
    expect(
      resumirRespuesta({ ...base, request_payload: { type: "text", text: { body: "hola" } }, response_payload: {} })
        .interpretacion,
    ).toBeNull();
  });

  it("nunca manda al navegador el payload crudo", () => {
    const r = resumirRespuesta({
      ...base,
      request_payload: { type: "text", from: "[redacted]", from_user_id: "x", text: { body: "si" } },
      response_payload: { chatbot: "si_texto", otro: "dato" },
    });
    expect(Object.keys(r).sort()).toEqual(["id", "interpretacion", "recibidaEn", "texto", "tipo"]);
  });

  it("un texto enorme se recorta", () => {
    const r = resumirRespuesta({
      ...base,
      request_payload: { type: "text", text: { body: "a".repeat(5000) } },
      response_payload: null,
    });
    expect(r.texto).toHaveLength(1001);
    expect(r.texto?.endsWith("…")).toBe(true);
  });

  it("un payload roto no revienta la pantalla", () => {
    expect(resumirRespuesta({ ...base, request_payload: null, response_payload: "x" })).toEqual({
      id: "log-1",
      recibidaEn: base.created_at,
      tipo: "desconocido",
      texto: null,
      interpretacion: null,
    });
  });
});
