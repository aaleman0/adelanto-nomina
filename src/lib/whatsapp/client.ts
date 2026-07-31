import { redactPII } from "@/lib/audit/redact";
import { GRAPH_BASE_URL as BASE_URL } from "./graph-version";

// Idioma de las plantillas al enviar. Configurable por si se agregan plantillas
// en otro locale; por defecto es_MX (el de las plantillas actuales).
const TEMPLATE_LANGUAGE = process.env.WHATSAPP_TEMPLATE_LANGUAGE || "es_MX";

// Timeout de las llamadas salientes a Meta: sin esto una conexión colgada
// bloquea el request (y, en el worker de la cola, la tarea) indefinidamente.
const FETCH_TIMEOUT_MS = 15_000;

export type TemplateComponent = {
  type: "body" | "header" | "button";
  sub_type?: "url" | "quick_reply";
  index?: number | string;
  parameters: Array<
    | { type: "text"; text: string }
    | { type: "payload"; payload: string }
    | { type: "action"; action: { type: string; url?: string } }
    | { type: "image"; image: { link: string } }
  >;
};

export type SendTemplateResult = {
  ok: boolean;
  messageId?: string;
  error?: string;
};

export type TestConnectionResult = {
  ok: boolean;
  phoneNumber?: string;
  displayName?: string;
  error?: string;
};

/**
 * Traduce el error de la Graph API a un mensaje accionable.
 *
 * Meta devuelve mensajes poco útiles en el endpoint de mensajes: un token
 * caducado llega como "Authentication Error" a secas, sin pista de qué hacer.
 * El código 190 (OAuthException) siempre significa token inválido o expirado,
 * así que se reemplaza por una instrucción concreta. El resto se pasa tal cual.
 */
export function describeMetaError(json: unknown, status: number): string {
  const error = (json as { error?: { message?: string; code?: number } } | null)?.error;
  if (error?.code === 190) {
    return "Token de WhatsApp expirado o inválido (código 190 de Meta). Genera uno nuevo y actualiza WHATSAPP_ACCESS_TOKEN.";
  }
  return error?.message ?? `HTTP ${status}`;
}

export class WhatsAppClient {
  private accessToken: string;
  private phoneNumberId: string;

  constructor(accessToken?: string, phoneNumberId?: string) {
    this.accessToken = accessToken ?? process.env.WHATSAPP_ACCESS_TOKEN ?? "";
    this.phoneNumberId = phoneNumberId ?? process.env.WHATSAPP_PHONE_NUMBER_ID ?? "";
  }

  async sendTemplateMessage(
    to: string,
    templateName: string,
    variables: Record<string, string>,
    components?: TemplateComponent[],
  ): Promise<SendTemplateResult> {
    if (!this.accessToken || !this.phoneNumberId) {
      return { ok: false, error: "WhatsApp no configurado (token o phone_number_id faltante)." };
    }

    const bodyComponents: TemplateComponent[] = components ?? [
      {
        type: "body",
        parameters: Object.entries(variables).map(([, value]) => ({
          type: "text" as const,
          text: value,
        })),
      },
    ];

    const body = {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: TEMPLATE_LANGUAGE },
        components: bodyComponents,
      },
    };

    try {
      const res = await fetch(`${BASE_URL}/${this.phoneNumberId}/messages`, {
        method: "POST",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const json = await res.json();

      if (!res.ok) {
        const errMsg = describeMetaError(json, res.status);
        // Redactar: la respuesta de error de Meta puede incluir el destinatario.
        console.error("[WhatsApp] send failed", JSON.stringify(redactPII(json)));
        return { ok: false, error: errMsg };
      }

      const messageId = json?.messages?.[0]?.id as string | undefined;
      // No registrar teléfonos (waId/inputPhone/to son PII); basta el messageId.
      console.log("[WhatsApp] send ok", JSON.stringify({ messageId }));
      return { ok: true, messageId };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Error de red." };
    }
  }

  async sendTemplateWithButton(
    to: string,
    templateName: string,
    variables: Record<string, string>,
    urlButtonSuffix?: string,
  ): Promise<SendTemplateResult> {
    if (!this.accessToken || !this.phoneNumberId) {
      return { ok: false, error: "WhatsApp no configurado (token o phone_number_id faltante)." };
    }

    const components: TemplateComponent[] = [
      {
        type: "body",
        parameters: Object.entries(variables).map(([, value]) => ({
          type: "text" as const,
          text: value,
        })),
      },
    ];

    // Botón URL dinámico: la plantilla fija la base de la URL y deja un `{{1}}`
    // de sufijo. Meta espera EXACTAMENTE ese sufijo como parámetro de texto (no
    // una URL completa ni una acción `open_url`), en el índice 0 del botón.
    if (urlButtonSuffix) {
      components.push({
        type: "button",
        sub_type: "url",
        index: "0",
        parameters: [{ type: "text", text: urlButtonSuffix }],
      });
    }

    const body = {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: TEMPLATE_LANGUAGE },
        components,
      },
    };

    try {
      const res = await fetch(`${BASE_URL}/${this.phoneNumberId}/messages`, {
        method: "POST",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const json = await res.json();

      if (!res.ok) {
        const errMsg = describeMetaError(json, res.status);
        return { ok: false, error: errMsg };
      }

      const messageId = json?.messages?.[0]?.id as string | undefined;
      return { ok: true, messageId };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Error de red." };
    }
  }

  async sendTextMessage(to: string, text: string): Promise<SendTemplateResult> {
    if (!this.accessToken || !this.phoneNumberId) {
      return { ok: false, error: "WhatsApp no configurado (token o phone_number_id faltante)." };
    }

    const body = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: {
        preview_url: false,
        body: text,
      },
    };

    try {
      const res = await fetch(`${BASE_URL}/${this.phoneNumberId}/messages`, {
        method: "POST",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const json = await res.json();

      if (!res.ok) {
        const errMsg = describeMetaError(json, res.status);
        return { ok: false, error: errMsg };
      }

      const messageId = json?.messages?.[0]?.id as string | undefined;
      return { ok: true, messageId };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Error de red." };
    }
  }

  /**
   * Envía un documento (PDF) al empleado por su link. WhatsApp descarga el
   * archivo desde `link` al momento del envío, así que basta con una URL pública
   * temporal (p. ej. una signed URL de Supabase Storage).
   *
   * Restricción de Meta: un documento iniciado por el negocio solo se entrega
   * dentro de la **ventana de 24 h** desde el último mensaje del usuario; fuera
   * de ella hace falta una plantilla con encabezado de documento. Por eso el
   * envío del contrato firmado es best-effort.
   */
  async sendDocument(
    to: string,
    link: string,
    filename: string,
    caption?: string,
  ): Promise<SendTemplateResult> {
    if (!this.accessToken || !this.phoneNumberId) {
      return { ok: false, error: "WhatsApp no configurado (token o phone_number_id faltante)." };
    }

    const body = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "document",
      document: {
        link,
        filename,
        ...(caption ? { caption } : {}),
      },
    };

    try {
      const res = await fetch(`${BASE_URL}/${this.phoneNumberId}/messages`, {
        method: "POST",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const json = await res.json();

      if (!res.ok) {
        return { ok: false, error: describeMetaError(json, res.status) };
      }

      const messageId = json?.messages?.[0]?.id as string | undefined;
      return { ok: true, messageId };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Error de red." };
    }
  }

  async testConnection(): Promise<TestConnectionResult> {
    if (!this.accessToken || !this.phoneNumberId) {
      return { ok: false, error: "Credenciales no configuradas." };
    }

    try {
      const res = await fetch(
        `${BASE_URL}/${this.phoneNumberId}?fields=display_phone_number,verified_name`,
        {
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          headers: { Authorization: `Bearer ${this.accessToken}` },
        },
      );

      const json = await res.json();

      if (!res.ok) {
        const errMsg = describeMetaError(json, res.status);
        return { ok: false, error: errMsg };
      }

      return {
        ok: true,
        phoneNumber: json?.display_phone_number,
        displayName: json?.verified_name,
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Error de red." };
    }
  }
}

export function getWhatsAppClient() {
  return new WhatsAppClient();
}
