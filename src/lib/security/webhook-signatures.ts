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

/**
 * Verifica el webhook de EasyLex de forma robusta a los dos esquemas comunes,
 * porque no está confirmado cuál usan y equivocarse deja el webhook rechazando
 * todo con 401 en silencio:
 *
 *   1. Secreto compartido plano en `x-easylex-signature` (lo documentado).
 *   2. HMAC-SHA256 del cuerpo crudo con el secreto (hex, con prefijo `sha256=`
 *      opcional) — el esquema estándar de la mayoría de proveedores.
 *
 * Acepta si CUALQUIERA coincide. Ambos exigen conocer el secreto, así que
 * admitir los dos no debilita la seguridad: solo nos hace inmunes a cuál mande
 * EasyLex. `rawBody` debe ser el cuerpo EXACTO recibido (`await request.text()`);
 * si se reserializa el JSON, el HMAC nunca coincide.
 */
export function verifyEasylexWebhook(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!secret || !signatureHeader) return false;

  // 1) Secreto compartido plano.
  if (safeEqual(signatureHeader, secret)) return true;

  // 2) HMAC-SHA256 del cuerpo, con prefijo `sha256=` opcional.
  const received = signatureHeader.startsWith("sha256=")
    ? signatureHeader.slice("sha256=".length)
    : signatureHeader;
  const expectedHex = createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");

  return safeEqual(received, expectedHex);
}

export const isProduction = () => process.env.NODE_ENV === "production";

/**
 * Segunda señal para exigir verificación de firma con independencia de
 * `NODE_ENV`. Toda la superficie de fail-open de desarrollo depende de
 * `isProduction()`; si un despliegue arranca con `NODE_ENV` mal fijado, esa
 * única señal fallaría abierta. Poniendo `WEBHOOK_ENFORCE_SIGNATURES=true` en
 * producción, un webhook sin secreto se rechaza aunque `NODE_ENV` no diga
 * "production". Sin definir (default) se conserva el comportamiento actual, así
 * que no afecta a desarrollo ni a los tests.
 */
export const enforceSignatures = () => process.env.WEBHOOK_ENFORCE_SIGNATURES === "true";
