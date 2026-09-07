import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { describeMetaError, WhatsAppClient } from "./client";

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

describe("WhatsAppClient.sendDocument", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const client = new WhatsAppClient("token-123", "phone-456");

  it("arma un mensaje type=document con link, filename y caption", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ messages: [{ id: "wamid.X" }] }) });

    const res = await client.sendDocument("5218110000000", "https://x/y.pdf", "contrato-firmado.pdf", "hola");

    expect(res).toEqual({ ok: true, messageId: "wamid.X" });
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toContain("/phone-456/messages");
    const body = JSON.parse(opts.body);
    expect(body.type).toBe("document");
    expect(body.document).toEqual({
      link: "https://x/y.pdf",
      filename: "contrato-firmado.pdf",
      caption: "hola",
    });
    expect(opts.headers.Authorization).toBe("Bearer token-123");
  });

  it("omite caption cuando no se pasa", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ messages: [{ id: "wamid.Y" }] }) });

    await client.sendDocument("521811", "https://x/y.pdf", "f.pdf");

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.document).not.toHaveProperty("caption");
  });

  it("devuelve error legible cuando Meta responde !ok (token 190)", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: "Authentication Error", code: 190 } }),
    });

    const res = await client.sendDocument("521811", "https://x/y.pdf", "f.pdf");

    expect(res.ok).toBe(false);
    expect(res.error).toContain("Token de WhatsApp");
  });

  it("no envía sin token o phone number", async () => {
    const res = await new WhatsAppClient("", "").sendDocument("521811", "https://x/y.pdf", "f.pdf");

    expect(res.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

/**
 * El idioma es de CADA plantilla, no una constante global. Meta rechaza el envío
 * con "template name does not exist in the translation" si no coincide — pasó de
 * verdad con una plantilla aprobada en inglés mientras el código mandaba es_MX.
 */
describe("idioma de la plantilla al enviar", () => {
  const fetchMock = vi.fn();
  const client = new WhatsAppClient("token-123", "phone-456");

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ messages: [{ id: "wamid.X" }] }) });
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("usa el idioma que se le pasa, no el global", async () => {
    await client.sendTemplateMessage("5218713330257", "plantilla_en_ingles", {}, [], "en");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.template.language.code).toBe("en");
  });

  it("cae al idioma por defecto cuando la plantilla no declara uno", async () => {
    await client.sendTemplateMessage("5218713330257", "otra", {}, [], null);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.template.language.code).toBe("es_MX");
  });
});
