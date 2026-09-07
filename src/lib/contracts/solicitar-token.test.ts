import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { signSolicitarToken, verifySolicitarToken, buildSolicitarUrl } from "./solicitar-token";

const OLD_ENV = { ...process.env };

beforeEach(() => {
  process.env.SOLICITAR_TOKEN_SECRET = "test-secret-para-firmar";
});
afterEach(() => {
  process.env = { ...OLD_ENV };
});

describe("solicitar-token", () => {
  it("firma y verifica el mismo empleado (round-trip)", () => {
    const token = signSolicitarToken("emp-123");
    const result = verifySolicitarToken(token);
    expect(result).toEqual({ ok: true, employeeId: "emp-123" });
  });

  it("rechaza una firma alterada", () => {
    const token = signSolicitarToken("emp-123");
    const tampered = token.slice(0, -2) + (token.endsWith("aa") ? "bb" : "aa");
    expect(verifySolicitarToken(tampered)).toEqual({ ok: false, reason: "signature" });
  });

  it("rechaza un payload alterado (otro empleado) — la firma ya no cuadra", () => {
    const forgedPayload = Buffer.from(JSON.stringify({ e: "otro", exp: Date.now() + 1000 })).toString("base64url");
    const token = signSolicitarToken("emp-123");
    const forged = `${forgedPayload}.${token.split(".")[1]}`;
    expect(verifySolicitarToken(forged).ok).toBe(false);
  });

  it("rechaza un token vencido", () => {
    const token = signSolicitarToken("emp-123", -1); // ya expirado
    expect(verifySolicitarToken(token)).toEqual({ ok: false, reason: "expired" });
  });

  it("rechaza un token malformado", () => {
    expect(verifySolicitarToken("sin-punto").ok).toBe(false);
    expect(verifySolicitarToken(".").ok).toBe(false);
    expect(verifySolicitarToken("").ok).toBe(false);
  });

  it("sin secreto: sign lanza y verify devuelve config", () => {
    delete process.env.SOLICITAR_TOKEN_SECRET;
    expect(() => signSolicitarToken("emp-123")).toThrow(/SOLICITAR_TOKEN_SECRET/);
    expect(verifySolicitarToken("cualquier.cosa")).toEqual({ ok: false, reason: "config" });
  });

  it("un token firmado con otro secreto no se acepta", () => {
    const token = signSolicitarToken("emp-123");
    process.env.SOLICITAR_TOKEN_SECRET = "secreto-diferente";
    expect(verifySolicitarToken(token)).toEqual({ ok: false, reason: "signature" });
  });

  it("buildSolicitarUrl arma la URL completa con la base", () => {
    const url = buildSolicitarUrl("emp-123", "https://mi-dominio.com/");
    expect(url.startsWith("https://mi-dominio.com/solicitar/")).toBe(true);
    const token = url.replace("https://mi-dominio.com/solicitar/", "");
    expect(verifySolicitarToken(token)).toEqual({ ok: true, employeeId: "emp-123" });
  });
});
