/** Shared status badge components for WhatsApp module */

const deliveryStyleMap: Record<string, string> = {
  sent: "bg-blue-50 text-blue-700 ring-blue-200",
  delivered: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  read: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  failed: "bg-red-50 text-red-700 ring-red-200",
  click: "bg-violet-50 text-violet-700 ring-violet-200",
};

const deliveryLabels: Record<string, string> = {
  sent: "Enviado",
  delivered: "Entregado",
  read: "Leído",
  failed: "Error",
  click: "Click",
};

/** Badge for individual message delivery status (sent, delivered, read, failed, click). */
export function DeliveryBadge({ status }: { status: string | null }) {
  const s = status ?? "sent";
  const cls = deliveryStyleMap[s] ?? "bg-surface-muted text-text-muted ring-border";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${cls}`}>
      {deliveryLabels[s] ?? s}
    </span>
  );
}

const bulkStatusStyleMap: Record<string, string> = {
  completed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  sending: "bg-amber-50 text-amber-700 ring-amber-200",
  failed: "bg-red-50 text-red-700 ring-red-200",
};

const bulkStatusLabels: Record<string, string> = {
  completed: "Completado",
  sending: "Enviando\u2026",
  failed: "Fallido",
};

/** Badge for bulk send status (completed, sending, failed). */
export function BulkStatusBadge({ status }: { status: string }) {
  const cls = bulkStatusStyleMap[status] ?? "bg-surface-muted text-text-muted ring-border";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${cls}`}>
      {bulkStatusLabels[status] ?? status}
    </span>
  );
}
