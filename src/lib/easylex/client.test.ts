import { describe, expect, it } from "vitest";
import { describeEasyLexError } from "./client";

describe("describeEasyLexError", () => {
  it("desglosa el error de esquema v2 (objeto anidado) en un mensaje legible", () => {
    // Forma real que devolvió EasyLex cuando biométrico exigía validateId.
    const body = {
      error: {
        path: "should be equal to one of the allowed values",
        message: "InvalidRequest",
        description: {
          keyword: "enum",
          dataPath: ".validateId",
          params: { allowedValues: ["true"] },
          message: "should be equal to one of the allowed values",
        },
        code: 502,
      },
    };
    const msg = describeEasyLexError(body, 400);
    // Antes esto era "[object Object]"; ahora nombra el campo y el valor exigido.
    expect(msg).toContain("validateId");
    expect(msg).toContain("true");
    expect(msg).not.toContain("[object Object]");
  });

  it("usa el message del error-objeto cuando no hay description", () => {
    expect(describeEasyLexError({ error: { message: "Boom", code: 106 } }, 400)).toBe("Boom [code 106]");
  });

  it("respeta el formato viejo con error como string", () => {
    expect(describeEasyLexError({ error: "Public or Secret key doesn't match" }, 400)).toBe(
      "Public or Secret key doesn't match",
    );
  });

  it("cae a message de nivel superior y luego al status HTTP", () => {
    expect(describeEasyLexError({ message: "Algo" }, 500)).toBe("Algo");
    expect(describeEasyLexError({}, 503)).toBe("HTTP 503");
  });
});
