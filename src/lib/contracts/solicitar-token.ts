import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Token firmado (HMAC-SHA256) que identifica al empleado en el link de
 * auto-servicio `/solicitar/<token>`. No guarda nada en la base: el link lleva
 * al empleado + expiración firmados, y la página los verifica. El secreto vive
 * en `SOLICITAR_TOKEN_SECRET`.
 *
 * Formato: `<payloadB64url>.<sigB64url>`, payload = `{ e: employeeId, exp: ms }`.
 */

const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 días (una vuelta del ciclo)

function secret(): string {
  return process.env.SOLICITAR_TOKEN_SECRET ?? "";
}

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function signSolicitarToken(employeeId: string, ttlMs = DEFAULT_TTL_MS): string {
  if (!secret()) {
    throw new Error("SOLICITAR_TOKEN_SECRET no está configurado: no se puede firmar el link de solicitud.");
  }
  const payload = b64url(JSON.stringify({ e: employeeId, exp: Date.now() + ttlMs }));
  return `${payload}.${sign(payload)}`;
}

export type VerifyResult =
  | { ok: true; employeeId: string }
  | { ok: false; reason: "config" | "malformed" | "signature" | "expired" };

export function verifySolicitarToken(token: string): VerifyResult {
  if (!secret()) return { ok: false, reason: "config" };

  const dot = token.indexOf(".");
  if (dot <= 0) return { ok: false, reason: "malformed" };
  const payload = token.slice(0, dot);
  const providedSig = token.slice(dot + 1);

  const expectedSig = sign(payload);
  const a = Buffer.from(providedSig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "signature" };
  }

  let data: { e?: unknown; exp?: unknown };
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (typeof data.e !== "string" || typeof data.exp !== "number") {
    return { ok: false, reason: "malformed" };
  }
  if (Date.now() > data.exp) return { ok: false, reason: "expired" };

  return { ok: true, employeeId: data.e };
}

/** URL completa del link de auto-servicio para un empleado. */
export function buildSolicitarUrl(employeeId: string, baseUrl?: string): string {
  const base = (baseUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  return `${base}/solicitar/${signSolicitarToken(employeeId)}`;
}
