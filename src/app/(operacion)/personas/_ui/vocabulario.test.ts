import { describe, expect, it } from "vitest";
import { comoLoTomoElSistema, queMandoLaPersona } from "./vocabulario";

describe("queMandoLaPersona", () => {
  it("dice qué mandó en palabras del operador", () => {
    expect(queMandoLaPersona("text")).toBe("Escribió");
    expect(queMandoLaPersona("button")).toBe("Tocó un botón");
    expect(queMandoLaPersona("interactive")).toBe("Tocó un botón");
    expect(queMandoLaPersona("audio")).toBe("Mandó una nota de voz");
    expect(queMandoLaPersona("tipo_nuevo_de_meta")).toBe("Mandó un mensaje");
    expect(queMandoLaPersona(null)).toBe("Mandó un mensaje");
  });
});

/**
 * La lectura es lo que le dice al operador si tiene que hacer algo. Tiene que
 * existir para todo lo que el chatbot anota, y decirse sin jerga.
 */
describe("comoLoTomoElSistema", () => {
  const ANOTACIONES_DEL_CHATBOT = [
    "si",
    "si_texto",
    "no",
    "no_texto",
    "text_fallback",
    "unknown_button",
    "no_soportado:audio",
    "demasiado_viejo",
    "error",
  ];

  it("todo lo que anota el chatbot tiene lectura", () => {
    for (const anotacion of ANOTACIONES_DEL_CHATBOT) {
      expect(comoLoTomoElSistema(anotacion), anotacion).not.toBeNull();
    }
  });

  it("ninguna lectura usa jerga técnica", () => {
    for (const anotacion of ANOTACIONES_DEL_CHATBOT) {
      expect(comoLoTomoElSistema(anotacion)?.texto, anotacion).not.toMatch(
        /fallback|payload|kind|webhook|button|null|undefined/i,
      );
    }
  });

  it("lo que no se entendió pide atención; un SÍ o un NO ya se atendió solo", () => {
    expect(comoLoTomoElSistema("text_fallback")?.tono).toBe("attention");
    expect(comoLoTomoElSistema("no_soportado:image")?.tono).toBe("attention");
    expect(comoLoTomoElSistema("si")?.tono).toBe("done");
    expect(comoLoTomoElSistema("no_texto")?.tono).toBe("neutral");
  });

  it("sin anotación no inventa nada", () => {
    expect(comoLoTomoElSistema(null)).toBeNull();
    expect(comoLoTomoElSistema(undefined)).toBeNull();
    expect(comoLoTomoElSistema("algo_desconocido")).toBeNull();
  });
});
