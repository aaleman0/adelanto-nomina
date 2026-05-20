import { describe, it, expect } from "vitest";
import { parseRequestContractPayload } from "./request-contract";

describe("parseRequestContractPayload", () => {
  it("debe parsear payload válido con subscriber_id", () => {
    const payload = {
      subscriber_id: "12345",
      rfc: "ABCD010101ABC",
      phone: "+521234567890",
      first_name: "Juan",
      last_name: "Pérez",
    };

    const result = parseRequestContractPayload(payload);

    expect(result.subscriberId).toBe("12345");
    expect(result.rfc).toBe("ABCD010101ABC");
    expect(result.telefonoNormalizado).toBe("521234567890");
    expect(result.firstName).toBe("Juan");
    expect(result.lastName).toBe("Pérez");
  });

  it("debe aceptar subscriberId (camelCase)", () => {
    const payload = {
      subscriberId: "67890",
      rfc: "EFGH020202DEF",
    };

    const result = parseRequestContractPayload(payload);

    expect(result.subscriberId).toBe("67890");
  });

  it("debe aceptar RFC en mayúsculas y minúsculas", () => {
    const payload = {
      subscriber_id: "12345",
      rfc: "abcd010101abc",
    };

    const result = parseRequestContractPayload(payload);

    expect(result.rfc).toBe("ABCD010101ABC");
  });

  it("debe lanzar error si falta subscriber_id", () => {
    const payload = {
      rfc: "ABCD010101ABC",
    };

    expect(() => parseRequestContractPayload(payload)).toThrow(
      "subscriber_id es requerido."
    );
  });

  it("debe lanzar error si falta RFC", () => {
    const payload = {
      subscriber_id: "12345",
    };

    expect(() => parseRequestContractPayload(payload)).toThrow(
      "RFC es requerido."
    );
  });

  it("debe normalizar teléfono con formato mexicano", () => {
    const payload = {
      subscriber_id: "12345",
      rfc: "ABCD010101ABC",
      phone: "1234567890",
    };

    const result = parseRequestContractPayload(payload);

    expect(result.telefonoNormalizado).toBe("521234567890");
  });

  it("debe aceptar teléfono ya normalizado con prefijo 52", () => {
    const payload = {
      subscriber_id: "12345",
      rfc: "ABCD010101ABC",
      telefono_normalizado: "521234567890",
    };

    const result = parseRequestContractPayload(payload);

    expect(result.telefonoNormalizado).toBe("521234567890");
  });

  it("debe permitir firstName y lastName en camelCase", () => {
    const payload = {
      subscriber_id: "12345",
      rfc: "ABCD010101ABC",
      firstName: "María",
      lastName: "García",
    };

    const result = parseRequestContractPayload(payload);

    expect(result.firstName).toBe("María");
    expect(result.lastName).toBe("García");
  });

  it("debe permitir campos opcionales nulos", () => {
    const payload = {
      subscriber_id: "12345",
      rfc: "ABCD010101ABC",
    };

    const result = parseRequestContractPayload(payload);

    expect(result.telefonoNormalizado).toBeNull();
    expect(result.firstName).toBeNull();
    expect(result.lastName).toBeNull();
  });

  it("debe incluir rawPayload en el resultado", () => {
    const payload = {
      subscriber_id: "12345",
      rfc: "ABCD010101ABC",
      extra_field: "valor_extra",
    };

    const result = parseRequestContractPayload(payload);

    expect(result.rawPayload).toEqual(payload);
  });
});
