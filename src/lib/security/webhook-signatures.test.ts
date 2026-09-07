import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import {
  safeEqual,
  verifyMetaSignature,
  verifySharedSecret,
  verifyEasylexWebhook,
} from "./webhook-signatures";

const APP_SECRET = "test_app_secret_123";

function signMeta(body: string, secret = APP_SECRET) {
  return "sha256=" + createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

describe("safeEqual", () => {
  it("acepta cadenas idénticas", () => {
    expect(safeEqual("abc123", "abc123")).toBe(true);
  });

  it("rechaza cadenas distintas de la misma longitud", () => {
    expect(safeEqual("abc123", "abc124")).toBe(false);
  });

  it("rechaza cadenas de distinta longitud sin lanzar", () => {
    // timingSafeEqual lanza si los buffers difieren en longitud:
    // la guarda previa debe evitarlo.
    expect(() => safeEqual("corto", "mucho mas largo")).not.toThrow();
    expect(safeEqual("corto", "mucho mas largo")).toBe(false);
  });

  it("rechaza contra cadena vacía", () => {
    expect(safeEqual("", "algo")).toBe(false);
  });

  it("maneja caracteres multibyte", () => {
    expect(safeEqual("ñandú", "ñandú")).toBe(true);
    expect(safeEqual("ñandú", "ñandu")).toBe(false);
  });
});

describe("verifyMetaSignature", () => {
  const body = JSON.stringify({ object: "whatsapp_business_account", entry: [] });

  it("acepta una firma válida", () => {
    expect(verifyMetaSignature(body, signMeta(body), APP_SECRET)).toBe(true);
  });

  it("rechaza una firma calculada con otro secreto", () => {
    expect(verifyMetaSignature(body, signMeta(body, "otro_secreto"), APP_SECRET)).toBe(false);
  });

  it("rechaza si el cuerpo cambió después de firmar", () => {
    const signature = signMeta(body);
    const tampered = JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: "x" }] });
    expect(verifyMetaSignature(tampered, signature, APP_SECRET)).toBe(false);
  });

  it("rechaza cuando falta la cabecera", () => {
    expect(verifyMetaSignature(body, null, APP_SECRET)).toBe(false);
  });

  it("rechaza cuando falta el prefijo sha256=", () => {
    const raw = createHmac("sha256", APP_SECRET).update(body, "utf8").digest("hex");
    expect(verifyMetaSignature(body, raw, APP_SECRET)).toBe(false);
  });

  it("rechaza cuando el secreto está vacío", () => {
    // Sin secreto no puede haber verificación válida: el fail-open debe
    // decidirse en el route handler, nunca aquí.
    expect(verifyMetaSignature(body, signMeta(body), "")).toBe(false);
  });

  it("es sensible a cambios de espaciado en el cuerpo", () => {
    // Confirma por qué hay que firmar el body crudo y no un JSON reserializado.
    const signature = signMeta(body);
    const reserialized = JSON.stringify(JSON.parse(body), null, 2);
    expect(verifyMetaSignature(reserialized, signature, APP_SECRET)).toBe(false);
  });
});

describe("verifySharedSecret", () => {
  it("acepta el secreto correcto", () => {
    expect(verifySharedSecret("secreto", "secreto")).toBe(true);
  });

  it("rechaza un secreto incorrecto", () => {
    expect(verifySharedSecret("malo", "secreto")).toBe(false);
  });

  it("rechaza cuando no llega cabecera", () => {
    expect(verifySharedSecret(null, "secreto")).toBe(false);
  });

  it("rechaza cuando el secreto esperado está vacío", () => {
    expect(verifySharedSecret("cualquier cosa", "")).toBe(false);
    expect(verifySharedSecret("", "")).toBe(false);
  });
});

describe("verifyEasylexWebhook", () => {
  const SECRET = "easylex_webhook_secret_abc";
  const body = JSON.stringify({ eventType: "DOCUMENT_SIGNED", data: { id: "doc-1" } });

  const hmacHex = (b: string, s = SECRET) =>
    createHmac("sha256", s).update(b, "utf8").digest("hex");

  it("acepta el secreto compartido plano en la cabecera", () => {
    expect(verifyEasylexWebhook(body, SECRET, SECRET)).toBe(true);
  });

  it("acepta un HMAC-SHA256 del cuerpo (hex crudo)", () => {
    expect(verifyEasylexWebhook(body, hmacHex(body), SECRET)).toBe(true);
  });

  it("acepta un HMAC con prefijo sha256=", () => {
    expect(verifyEasylexWebhook(body, "sha256=" + hmacHex(body), SECRET)).toBe(true);
  });

  it("rechaza un HMAC calculado con otro secreto", () => {
    expect(verifyEasylexWebhook(body, hmacHex(body, "otro"), SECRET)).toBe(false);
  });

  it("rechaza si el cuerpo cambió después de firmar (HMAC)", () => {
    const sig = hmacHex(body);
    const tampered = JSON.stringify({ eventType: "DOCUMENT_SIGNED", data: { id: "doc-2" } });
    expect(verifyEasylexWebhook(tampered, sig, SECRET)).toBe(false);
  });

  it("rechaza una cabecera vacía o ausente", () => {
    expect(verifyEasylexWebhook(body, null, SECRET)).toBe(false);
    expect(verifyEasylexWebhook(body, "", SECRET)).toBe(false);
  });

  it("rechaza cuando el secreto esperado está vacío", () => {
    expect(verifyEasylexWebhook(body, SECRET, "")).toBe(false);
  });
});
