import type { RateLimitConfig } from "./rate-limit";

/**
 * Límites por endpoint, reunidos en un sitio para poder verlos y ajustarlos de
 * un vistazo en lugar de rastrearlos por los handlers.
 *
 * Los valores son deliberadamente holgados: el objetivo es cortar el abuso
 * evidente, no regular el tráfico legítimo. Un operador real nunca se acerca a
 * estos números. Recuerda que el límite es por instancia (ver rate-limit.ts).
 */
export const RATE_LIMITS = {
  /**
   * Webhook de Meta. Meta reintenta y puede ráfagas de eventos, así que el
   * límite es alto; solo frena un bombardeo. La firma HMAC ya rechaza lo no
   * legítimo, esto evita que ni siquiera llegue a verificarse en masa.
   */
  webhookWhatsapp: { name: "webhook:whatsapp", limit: 240, windowMs: 60_000 },

  /** Webhook de firma de EasyLex. Menos volumen esperado que WhatsApp. */
  webhookEasylex: { name: "webhook:easylex", limit: 120, windowMs: 60_000 },

  /**
   * Envío masivo de WhatsApp. Caro y con efectos hacia Meta: pocas ejecuciones
   * por minuto bastan para un humano, y un bucle accidental se corta pronto.
   */
  whatsappBulkSend: { name: "whatsapp:bulk-send", limit: 12, windowMs: 60_000 },

  /** Prueba de conexión y sincronización de plantillas: acciones puntuales. */
  whatsappAdminAction: { name: "whatsapp:admin-action", limit: 20, windowMs: 60_000 },

  /** Subida e importación de CSV: pesada, poco frecuente. */
  importUpload: { name: "import:upload", limit: 20, windowMs: 60_000 },
} satisfies Record<string, RateLimitConfig>;
