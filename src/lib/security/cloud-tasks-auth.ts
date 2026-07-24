import { google } from "googleapis";
import { cloudTasksEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { safeEqual, isProduction } from "./webhook-signatures";

/**
 * Autenticación del endpoint worker que invoca Cloud Tasks.
 *
 * El worker es público a nivel de red (Cloud Tasks no tiene sesión de
 * navegador), así que esta verificación es lo único que lo protege. Cloud Tasks
 * firma cada petición con un token OIDC emitido por Google para la service
 * account configurada; se valida la firma, el `audience` y el emisor.
 */

export type WorkerAuthResult =
  | { ok: true; via: "oidc" | "shared-secret" | "skipped-dev" }
  | { ok: false; reason: string };

/**
 * Verifica el token OIDC de la cabecera Authorization.
 *
 * `audience` debe coincidir exactamente con la URL configurada al crear la
 * tarea; de lo contrario un token válido emitido para otro servicio sería
 * aceptado aquí.
 */
async function verifyOidcToken(token: string, audience: string): Promise<WorkerAuthResult> {
  try {
    const client = new google.auth.OAuth2();
    const ticket = await client.verifyIdToken({ idToken: token, audience });
    const payload = ticket.getPayload();

    if (!payload) {
      return { ok: false, reason: "token_sin_payload" };
    }

    if (payload.email_verified !== true) {
      return { ok: false, reason: "email_no_verificado" };
    }

    const expectedAccount = cloudTasksEnv.invokerServiceAccount;
    // En producción el binding a la service account es OBLIGATORIO: sin él se
    // aceptaría cualquier token OIDC firmado por Google con el audience correcto.
    if (!expectedAccount && isProduction()) {
      return { ok: false, reason: "service_account_no_configurada_en_produccion" };
    }
    if (expectedAccount && payload.email !== expectedAccount) {
      return { ok: false, reason: "service_account_inesperada" };
    }

    return { ok: true, via: "oidc" };
  } catch (error) {
    logger.warn("tasks.worker.oidc_invalid", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, reason: "oidc_invalido" };
  }
}

/**
 * Autentica una petición al worker.
 *
 * Orden:
 * 1. Token OIDC (lo que usa Cloud Tasks en producción).
 * 2. Secreto compartido, **solo fuera de producción**, para poder disparar el
 *    worker a mano durante el desarrollo.
 * 3. Fuera de producción y sin nada configurado, se permite y se registra.
 *
 * En producción, sin token válido no se pasa.
 */
/**
 * Audience esperado del token OIDC. Debe coincidir con la URL con que Cloud
 * Tasks creó la tarea. Se usa el **origen configurado** (`TASKS_WORKER_BASE_URL`)
 * más el path real de la petición, en vez del `Host` entrante —que un atacante
 * controla— para que un token emitido para otro host no se acepte aquí. Sin
 * base configurada, cae al comportamiento anterior (URL de la petición).
 */
function expectedAudience(request: Request): string {
  const requestUrl = new URL(request.url);
  const base = cloudTasksEnv.workerBaseUrl;
  if (base) {
    try {
      return `${new URL(base).origin}${requestUrl.pathname}`;
    } catch {
      // Base mal formada: no degradar a algo peor, usar la URL de la petición.
    }
  }
  return `${requestUrl.origin}${requestUrl.pathname}`;
}

export async function authenticateWorkerRequest(request: Request): Promise<WorkerAuthResult> {
  const authorization = request.headers.get("authorization");
  const bearer = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;

  if (bearer) {
    return verifyOidcToken(bearer, expectedAudience(request));
  }

  const sharedSecret = cloudTasksEnv.workerSecret;
  const provided = request.headers.get("x-tasks-secret");

  if (sharedSecret && provided) {
    if (isProduction()) {
      // Aceptar un secreto estático en producción degradaría la garantía que
      // aporta OIDC (rotación, alcance y expiración gestionados por Google).
      return { ok: false, reason: "secreto_compartido_no_permitido_en_produccion" };
    }
    return safeEqual(provided, sharedSecret)
      ? { ok: true, via: "shared-secret" }
      : { ok: false, reason: "secreto_incorrecto" };
  }

  if (isProduction()) {
    return { ok: false, reason: "sin_credenciales" };
  }

  logger.warn("tasks.worker.auth_skipped", {
    detail: "Worker sin autenticación (solo permitido fuera de producción).",
  });
  return { ok: true, via: "skipped-dev" };
}
