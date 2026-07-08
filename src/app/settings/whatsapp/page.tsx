import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { WhatsAppConfigForm } from "@/components/settings/whatsapp-config-form";

export default function WhatsAppSettingsPage() {
  return (
    <AppShell>
      <PageHeader title="WhatsApp" />
      <WhatsAppConfigForm />
    </AppShell>
  );
}
