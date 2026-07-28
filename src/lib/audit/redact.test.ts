import { describe, it, expect } from "vitest";
import { redactPII } from "./redact";

describe("redactPII", () => {
  it("enmascara los identificadores sensibles del esquema propio", () => {
    const out = redactPII({
      rfc: "GHHK674551KH1",
      curp: "AEGM900515HNLLRN09",
      clabe: "012345678901234567",
      telefono_normalizado: "5218713330257",
      email: "a@b.com",
      nombre: "Angel",
      apellido_paterno: "Aleman",
      domicilio: "Calle 123",
      monto: 4000,
    });
    for (const k of ["rfc", "curp", "clabe", "telefono_normalizado", "email", "nombre", "apellido_paterno", "domicilio"]) {
      expect(out[k as keyof typeof out], k).toBe("[redacted]");
    }
    // No sensible: se conserva.
    expect(out.monto).toBe(4000);
  });

  it("cubre la forma de Meta (from, wa_id) y EasyLex (firstName) anidados", () => {
    const out = redactPII({
      entry: [{ changes: [{ value: { messages: [{ from: "5218713330257", text: { body: "hola" } }] } }] }],
      data: { firstName: "Angel", lastName: "Aleman", documentId: "doc-123" },
    });
    expect(out.entry[0].changes[0].value.messages[0].from).toBe("[redacted]");
    // El cuerpo del mensaje libre NO se toca.
    expect(out.entry[0].changes[0].value.messages[0].text.body).toBe("hola");
    expect(out.data.firstName).toBe("[redacted]");
    expect(out.data.lastName).toBe("[redacted]");
    // Identificador neutral (documentId) se conserva para depurar.
    expect(out.data.documentId).toBe("doc-123");
  });

  it("no rompe con null/undefined/primitivos y conserva la forma", () => {
    expect(redactPII(null)).toBe(null);
    expect(redactPII({ telefono: null, rfc: undefined })).toEqual({ telefono: null, rfc: undefined });
    expect(redactPII({ template: { name: "adelanto_nomina_v2" } })).toEqual({
      template: { name: "adelanto_nomina_v2" },
    });
  });
});
