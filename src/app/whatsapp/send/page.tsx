import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { BulkSendForm } from "@/components/whatsapp/bulk-send-form";

export default function WhatsAppSendPage() {
  return (
    <AppShell>
      <PageHeader
        title="Envío Masivo WhatsApp"
        eyebrow="WhatsApp"
        description="Envía el link de contrato a múltiples empleados elegibles vía WhatsApp API."
      />
      <BulkSendForm />
    </AppShell>
  );
}
