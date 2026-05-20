import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { WhatsAppConfigForm } from "@/components/settings/whatsapp-config-form";

export default function WhatsAppSettingsPage() {
  return (
    <AppShell>
      <PageHeader
        title="Configuración de WhatsApp"
        eyebrow="WhatsApp API"
        description="Conecta tu número de WhatsApp Business a través de Meta Cloud API."
      />
      <WhatsAppConfigForm />
    </AppShell>
  );
}
