import { describe, it, expect } from "vitest";
import { plantillaLlevaBotonDeEnlace } from "./formato";

/**
 * Detectar la plantilla obsoleta importa porque su fallo es SILENCIOSO: el envío
 * reporta éxito, el mensaje llega bien, y solo el empleado descubre —al tocar el
 * botón— que el enlace no lleva a su contrato.
 */
describe("plantillaLlevaBotonDeEnlace", () => {
  it("detecta la plantilla vieja, la del botón de enlace", () => {
    expect(
      plantillaLlevaBotonDeEnlace([
        { type: "BODY", text: "Hola {{1}}" },
        { type: "BUTTONS", buttons: [{ type: "URL", text: "FIRMAR CONTRATO", url: "https://easylex.com/x/{{1}}" }] },
      ]),
    ).toBe(true);
  });

  it("acepta la plantilla del chatbot (botones de respuesta)", () => {
    expect(
      plantillaLlevaBotonDeEnlace([
        { type: "HEADER", format: "IMAGE" },
        { type: "BODY", text: "Hola {{1}}, tienes {{3}}" },
        {
          type: "BUTTONS",
          buttons: [
            { type: "QUICK_REPLY", text: "Sí, lo quiero" },
            { type: "QUICK_REPLY", text: "No, gracias" },
          ],
        },
      ]),
    ).toBe(false);
  });

  it("acepta una plantilla sin botones", () => {
    expect(plantillaLlevaBotonDeEnlace([{ type: "BODY", text: "Aviso" }])).toBe(false);
  });

  it("no revienta si la plantilla viene sin componentes", () => {
    expect(plantillaLlevaBotonDeEnlace(null)).toBe(false);
    expect(plantillaLlevaBotonDeEnlace(undefined)).toBe(false);
    expect(plantillaLlevaBotonDeEnlace([])).toBe(false);
  });

  it("no depende de mayúsculas ni del nombre de la plantilla", () => {
    expect(
      plantillaLlevaBotonDeEnlace([{ type: "buttons", buttons: [{ type: "url", text: "Ver" }] }]),
    ).toBe(true);
  });
});
