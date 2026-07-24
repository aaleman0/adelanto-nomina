import { describe, it, expect } from "vitest";
import { describeMetaError } from "./client";

describe("describeMetaError", () => {
  it("traduce el código 190 (token expirado/inválido) a un mensaje accionable", () => {
    // En el endpoint de mensajes, Meta resume el token caducado como
    // "Authentication Error"; se reemplaza por algo que diga qué hacer.
    const json = { error: { message: "Authentication Error", code: 190 } };
    const result = describeMetaError(json, 401);
    expect(result).toContain("Token de WhatsApp");
    expect(result).toContain("WHATSAPP_ACCESS_TOKEN");
    expect(result).not.toBe("Authentication Error");
  });

  it("también cubre el 190 con el mensaje detallado de sesión expirada", () => {
    const json = { error: { message: "Error validating access token: Session has expired…", code: 190 } };
    expect(describeMetaError(json, 400)).toContain("código 190");
  });

  it("pasa tal cual otros errores de Meta con mensaje", () => {
    const json = { error: { message: "Template name does not exist", code: 132001 } };
    expect(describeMetaError(json, 400)).toBe("Template name does not exist");
  });

  it("cae al código HTTP cuando no hay mensaje de error", () => {
    expect(describeMetaError({}, 500)).toBe("HTTP 500");
    expect(describeMetaError(null, 503)).toBe("HTTP 503");
  });
});
