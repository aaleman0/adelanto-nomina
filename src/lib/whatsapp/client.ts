const BASE_URL = "https://graph.facebook.com/v18.0";

export type TemplateComponent = {
  type: "body" | "header" | "button";
  sub_type?: "url" | "quick_reply";
  index?: number;
  parameters: Array<{ type: "text"; text: string } | { type: "payload"; payload: string }>;
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
        language: { code: "es_MX" },
        components: bodyComponents,
      },
    };

    try {
      const res = await fetch(`${BASE_URL}/${this.phoneNumberId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const json = await res.json();

      if (!res.ok) {
        const errMsg = json?.error?.message ?? `HTTP ${res.status}`;
        return { ok: false, error: errMsg };
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
          headers: { Authorization: `Bearer ${this.accessToken}` },
        },
      );

      const json = await res.json();

      if (!res.ok) {
        const errMsg = json?.error?.message ?? `HTTP ${res.status}`;
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
