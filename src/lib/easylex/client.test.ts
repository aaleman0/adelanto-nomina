import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { describeEasyLexError, EasyLexClient } from "./client";

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

describe("EasyLexClient.getSignedDocument", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const client = new EasyLexClient({ accessKeyId: "pk", secretAccessKey: "sk", baseUrl: "https://api.test" });

  it("devuelve el PDF como Buffer cuando la respuesta es binaria", async () => {
    const bytes = new TextEncoder().encode("%PDF-1.4 firmado");
    fetchMock.mockResolvedValue({ ok: true, arrayBuffer: async () => bytes.buffer });

    const res = await client.getSignedDocument("doc-1");

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(Buffer.isBuffer(res.pdf)).toBe(true);
      expect(res.pdf.toString("utf8")).toContain("%PDF");
    }
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.test/api/public/v2/document/signed/doc-1");
    expect(opts.headers["access-key-id"]).toBe("pk");
    expect(opts.headers["secret-access-key"]).toBe("sk");
  });

  it("traduce el error JSON cuando el documento no está firmado (no trata los bytes como PDF)", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: "Document not signed", code: 2907 } }),
    });

    const res = await client.getSignedDocument("doc-2");

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("Document not signed");
  });

  it("no llama a la API sin credenciales", async () => {
    const bare = new EasyLexClient({ accessKeyId: "", secretAccessKey: "", baseUrl: "https://api.test" });

    const res = await bare.getSignedDocument("doc-3");

    expect(res.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
