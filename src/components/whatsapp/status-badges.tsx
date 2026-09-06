/** Shared status badge components for WhatsApp module */

const deliveryStyleMap: Record<string, string> = {
  sent: "bg-surface-muted text-text-secondary ring-border",
  delivered: "text-success ring-[var(--success-border)]",
  read: "bg-surface-muted text-text-secondary ring-border",
  failed: "text-danger ring-[var(--danger-border)]",
  click: "bg-surface-muted text-text-secondary ring-border",
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
  completed: "text-success ring-[var(--success-border)]",
  sending: "text-warning ring-[var(--warning-border)]",
  failed: "text-danger ring-[var(--danger-border)]",
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
