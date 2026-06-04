import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getWhatsAppClient } from "@/lib/whatsapp/client";

export function verifyWebhook(
  mode: string,
  token: string,
  challenge: string,
): string | null {
  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (mode === "subscribe" && token === verifyToken) {
    return challenge;
  }
  return null;
}

export type WebhookEntry = {
  id: string;
  changes: Array<{
    value: {
      messaging_product: string;
      metadata?: { display_phone_number: string; phone_number_id: string };
      messages?: Array<{
        id: string;
        from: string;
        timestamp: string;
        type: string;
        text?: { body: string };
      }>;
      statuses?: Array<{
        id: string;
        recipient_id: string;
        status: "sent" | "delivered" | "read" | "failed";
        timestamp: string;
        errors?: Array<{ code: number; title: string }>;
      }>;
    };
    field: string;
  }>;
};

export async function handleWebhook(payload: {
  object: string;
  entry: WebhookEntry[];
}) {
  if (payload.object !== "whatsapp_business_account") return;

  const supabase = getSupabaseAdmin();

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;

      const value = change.value;

      // Mensajes entrantes
      for (const msg of value.messages ?? []) {
        await supabase.from("integration_logs").insert({
          provider: "whatsapp",
          direction: "inbound",
          endpoint: "/api/webhooks/whatsapp",
          method: "POST",
          request_payload: msg as unknown as Record<string, unknown>,
          response_payload: {},
          status_code: 200,
          status: "success",
          success: true,
          correlation_id: msg.id,
          entity_type: "whatsapp_messages",
        });

        if (process.env.WHATSAPP_DEBUG_AUTO_REPLY === "true") {
          const reply = await getWhatsAppClient().sendTextMessage(
            msg.from,
            `Debug conectado ✅ Recibimos tu mensaje: "${msg.text?.body ?? msg.type}"`,
          );

          if (reply.ok) {
            await supabase.from("integration_logs").insert({
              provider: "whatsapp",
              direction: "outbound",
              endpoint: "/api/webhooks/whatsapp/debug-auto-reply",
              method: "POST",
              request_payload: { to: msg.from, inboundMessageId: msg.id },
              response_payload: { messageId: reply.messageId },
              status_code: 200,
              status: "success",
              success: true,
              correlation_id: reply.messageId,
              entity_type: "whatsapp_messages",
            });
          }
        }
      }

      // Delivery / read statuses
      for (const status of value.statuses ?? []) {
        const deliveryStatus = status.status;
        const waMessageId = status.id;

        const updateFields: Record<string, unknown> = {
          delivery_status: deliveryStatus,
        };

        if (deliveryStatus === "delivered") {
          updateFields.delivered_at = new Date(Number(status.timestamp) * 1000).toISOString();
        } else if (deliveryStatus === "read") {
          updateFields.read_at = new Date(Number(status.timestamp) * 1000).toISOString();
        } else if (deliveryStatus === "failed") {
          const errTitle = status.errors?.[0]?.title ?? "Error desconocido";
          updateFields.error_message = errTitle;
        }

        // Actualizar registro en whatsapp_contract_messages
        await supabase
          .from("whatsapp_contract_messages")
          .update(updateFields)
          .eq("wa_message_id", waMessageId);

        // También actualizar bulk_send counters si aplica
        if (deliveryStatus === "delivered" || deliveryStatus === "read") {
          const { data: msg } = await supabase
            .from("whatsapp_contract_messages")
            .select("bulk_send_id")
            .eq("wa_message_id", waMessageId)
            .maybeSingle();

          if (msg?.bulk_send_id) {
            const field = deliveryStatus === "read" ? "read_count" : "delivered_count";
            await supabase.rpc("increment_bulk_send_counter", {
              p_bulk_send_id: msg.bulk_send_id,
              p_field: field,
            });
          }
        }
      }
    }
  }
}
