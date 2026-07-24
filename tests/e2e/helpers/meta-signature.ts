import { createHmac } from "node:crypto";
import type { APIRequestContext, APIResponse } from "@playwright/test";

/**
 * Envío de payloads firmados al webhook de Meta.
 *
 * El webhook verifica `X-Hub-Signature-256` calculada sobre el **cuerpo crudo**
 * con `WHATSAPP_APP_SECRET`. Un payload sin firmar recibe 401, así que las
 * pruebas tienen que firmar igual que lo haría Meta.
 *
 * Detalle importante: se serializa el JSON aquí y se envía como cadena, no con
 * la opción `data` de Playwright. Si Playwright reserializara el objeto, los
 * bytes podrían no coincidir con los que se firmaron y la validación fallaría.
 */

function getAppSecret(): string {
  return process.env.WHATSAPP_APP_SECRET ?? "";
}

export function signMetaPayload(rawBody: string): string | null {
  const secret = getAppSecret();
  if (!secret) return null;

  return "sha256=" + createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}

/**
 * POST al webhook de Meta con la firma correcta.
 *
 * Si `WHATSAPP_APP_SECRET` no está configurado no se envía firma: fuera de
 * producción el webhook lo permite, así que la prueba sigue siendo válida.
 */
export async function postSignedWebhook(
  request: APIRequestContext,
  payload: unknown,
): Promise<APIResponse> {
  const rawBody = JSON.stringify(payload);
  const signature = signMetaPayload(rawBody);

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (signature) headers["x-hub-signature-256"] = signature;

  return request.post("/api/webhooks/whatsapp", { headers, data: rawBody });
}
