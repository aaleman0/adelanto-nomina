"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { DataTable, DataTableCell, DataTableEmpty, DataTableHead, DataTableHeaderCell } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";

type WhatsAppMessage = {
  id: string;
  message_type: string;
  status: string | null;
  delivery_status: string | null;
  created_at: string | null;
  delivered_at: string | null;
  error_message: string | null;
};

const fmtDate = (d: string | null) =>
  d ? new Intl.DateTimeFormat("es-MX", { dateStyle: "short" }).format(new Date(d)) : "-";

function getDeliveryTone(status: string | null) {
  const s = status ?? "unknown";
  if (s === "failed") return "danger";
  if (["delivered", "read", "click"].includes(s)) return "success";
  if (s === "sent") return "neutral";
  return "neutral";
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
    <Card className="p-4">
      <h3 className="text-sm font-medium text-text-muted">Historial de mensajes</h3>
      <div className="mt-3">
        {loading && <p className="text-sm text-text-muted">Cargando...</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!loading && !error && messages.length === 0 && (
          <p className="text-sm text-text-muted">Sin mensajes registrados.</p>
        )}
        {!loading && !error && messages.length > 0 && (
          <DataTable className="w-full">
            <DataTableHead>
              <tr>
                <DataTableHeaderCell>Fecha</DataTableHeaderCell>
                <DataTableHeaderCell>Tipo</DataTableHeaderCell>
                <DataTableHeaderCell>Estado</DataTableHeaderCell>
                <DataTableHeaderCell>Entregado</DataTableHeaderCell>
              </tr>
            </DataTableHead>
            <tbody>
              {messages.map((msg) => (
                <tr key={msg.id} className="border-t border-border">
                  <DataTableCell className="text-text-muted">{fmtDate(msg.created_at)}</DataTableCell>
                  <DataTableCell>{msg.message_type}</DataTableCell>
                  <DataTableCell>
                    <StatusBadge status={(msg.delivery_status ?? msg.status) || "-"} tone={getDeliveryTone(msg.delivery_status ?? msg.status)} />
                  </DataTableCell>
                  <DataTableCell className="text-text-muted">{fmtDate(msg.delivered_at)}</DataTableCell>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </div>
    </Card>
  );
}
