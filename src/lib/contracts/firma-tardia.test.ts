import { describe, it, expect } from "vitest";
import { queHacerConLaFirma } from "./firma-tardia";

/**
 * El caso que protege: se reimporta la nómina a media tarde, la solicitud de la
 * mañana queda `reemplazada`, y quien tenía abierta la pantalla de EasyLex
 * termina de firmar el documento viejo. Si eso se registrara como firma buena,
 * el pago del monto anterior entraría al Excel del ciclo sin que nadie lo viera.
 */
describe("queHacerConLaFirma", () => {
  it("una solicitud en curso sí se registra como firma", () => {
    for (const estado of ["recibida", "generando", "link_generado"]) {
      expect(queHacerConLaFirma(estado), estado).toBe("registrar");
    }
  });

  it("una solicitud reemplazada NO revive: solo se guarda la evidencia", () => {
    expect(queHacerConLaFirma("reemplazada")).toBe("solo_evidencia");
  });

  it("un estado que no reconoce cae del lado seguro", () => {
    // Lista blanca, no lista negra: si mañana alguien agrega un estado
    // 'cancelada' y olvida este archivo, la firma se guarda como evidencia y
    // espera al operador, en vez de disparar un pago por su cuenta.
    for (const estado of ["cancelada", "error", "firmado", "Reemplazada", "reemplazada_v2", ""]) {
      expect(queHacerConLaFirma(estado), estado).toBe("solo_evidencia");
    }
  });

  it("sin estado tampoco registra", () => {
    expect(queHacerConLaFirma(null)).toBe("solo_evidencia");
    expect(queHacerConLaFirma(undefined)).toBe("solo_evidencia");
  });
});
