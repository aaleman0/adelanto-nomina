"use client";

import { useState, useEffect } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";

type WhatsAppMessage = {
  id: string;
  message_type: string;
  status: string | null;
  delivery_status: string | null;
  wa_message_id: string | null;
  bulk_send_id: string | null;
  clicked_at: string | null;
  created_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  error_message: string | null;
  retry_count: number | null;
  correlation_id: string | null;
  offer_id: string | null;
  contract_request_id: string | null;
};

const fmtDate = (d: string | null) =>
  d
    ? new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date(d))
    : "-";

function DeliveryBadge({ status }: { status: string | null }) {
  const s = status ?? "unknown";

  const map: Record<string, { label: string; cls: string }> = {
    sent: { label: "Enviado", cls: "bg-blue-50 text-blue-700 ring-blue-200" },
    delivered: { label: "Entregado", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
    read: { label: "Leído", cls: "bg-indigo-50 text-indigo-700 ring-indigo-200" },
    failed: { label: "Error", cls: "bg-red-50 text-red-700 ring-red-200" },
    click: { label: "Click", cls: "bg-violet-50 text-violet-700 ring-violet-200" },
    unknown: { label: "Desconocido", cls: "bg-surface-muted text-text-muted ring-border" },
  };

  const { label, cls } = map[s] ?? map.unknown;

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${cls}`}>
      {label}
    </span>
  );
}

export function MessageHistory({ employeeId }: { employeeId: string }) {
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/whatsapp/messages/employee?employeeId=${employeeId}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.ok) {
          setMessages(json.messages ?? []);
        } else {
          setError(json.error ?? "Error al cargar mensajes.");
        }
      })
      .catch(() => setError("Error de red."))
      .finally(() => setLoading(false));
  }, [employeeId]);

  return (
    <Card>
      <CardHeader>
        <h3 className="text-h2 font-semibold text-text-primary">Historial de mensajes WhatsApp</h3>
        <p className="text-sm text-text-muted">Mensajes enviados a este empleado vía WhatsApp API.</p>
      </CardHeader>
      <CardBody>
        {loading && (
          <p className="text-sm text-text-muted animate-pulse">Cargando historial...</p>
        )}

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        {!loading && !error && messages.length === 0 && (
          <div className="rounded-base border border-dashed border-border py-8 text-center text-sm text-text-muted">
            Sin mensajes de WhatsApp registrados para este empleado.
          </div>
        )}

        {!loading && messages.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-text-muted">Fecha</th>
                  <th className="px-3 py-2 text-left font-semibold text-text-muted">Tipo</th>
                  <th className="px-3 py-2 text-left font-semibold text-text-muted">Estado entrega</th>
                  <th className="px-3 py-2 text-left font-semibold text-text-muted">Entregado</th>
                  <th className="px-3 py-2 text-left font-semibold text-text-muted">Leído</th>
                  <th className="px-3 py-2 text-left font-semibold text-text-muted">WA Message ID</th>
                  <th className="px-3 py-2 text-left font-semibold text-text-muted">Error</th>
                </tr>
              </thead>
              <tbody>
                {messages.map((msg, i) => (
                  <tr
                    key={msg.id}
                    className={[
                      "border-t border-border",
                      i % 2 === 0 ? "bg-background" : "bg-surface-muted/30",
                    ].join(" ")}
                  >
                    <td className="px-3 py-2 whitespace-nowrap text-text-muted">{fmtDate(msg.created_at)}</td>
                    <td className="px-3 py-2 text-text-primary">{msg.message_type}</td>
                    <td className="px-3 py-2">
                      <DeliveryBadge status={msg.delivery_status ?? msg.status} />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-text-muted text-xs">{fmtDate(msg.delivered_at)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-text-muted text-xs">{fmtDate(msg.read_at)}</td>
                    <td className="px-3 py-2 font-mono text-xs text-text-muted max-w-[160px] truncate" title={msg.wa_message_id ?? undefined}>
                      {msg.wa_message_id ?? "-"}
                    </td>
                    <td className="px-3 py-2 text-xs text-red-600 max-w-[180px] truncate" title={msg.error_message ?? undefined}>
                      {msg.error_message ?? "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
