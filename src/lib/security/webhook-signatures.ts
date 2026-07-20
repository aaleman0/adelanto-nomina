import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Utilidades de verificación de webhooks entrantes.
 *
 * Todas las comparaciones de secretos usan `timingSafeEqual` para no filtrar
 * información por el tiempo de respuesta. Una comparación con `===` sale del
 * bucle en el primer byte distinto, lo que permite reconstruir un secreto byte
 * a byte midiendo latencias.
 */

/**
 * Compara dos cadenas en tiempo constante.
 *
 * La diferencia de longitud sí se filtra (es inevitable y no explotable en la
 * práctica): lo que se protege es el contenido.
 */
export function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "utf8");
  const bufferB = Buffer.from(b, "utf8");

  if (bufferA.length !== bufferB.length) return false;

  return timingSafeEqual(bufferA, bufferB);
}

/**
 * Verifica la cabecera `X-Hub-Signature-256` de Meta.
 *
 * IMPORTANTE: `rawBody` debe ser el cuerpo exacto tal como llegó
 * (`await request.text()`). Si se parsea y se vuelve a serializar el JSON, los
 * bytes cambian y la firma nunca coincide.
 *
 * @see https://developers.facebook.com/docs/graph-api/webhooks/getting-started#validate-payloads
 */
export function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
): boolean {
  if (!appSecret || !signatureHeader) return false;
  if (!signatureHeader.startsWith("sha256=")) return false;

  const expected =
    "sha256=" +
    createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");

  return safeEqual(signatureHeader, expected);
}

/**
 * Verifica un secreto compartido enviado como cabecera plana
 * (el esquema que usa EasyLex con `x-easylex-signature`).
 */
export function verifySharedSecret(
  received: string | null,
  expected: string,
): boolean {
  if (!expected || !received) return false;
  return safeEqual(received, expected);
}

export const isProduction = () => process.env.NODE_ENV === "production";
