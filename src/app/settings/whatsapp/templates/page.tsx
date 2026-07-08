import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { TemplatesPanel } from "@/components/whatsapp/templates-panel";

export default function WhatsAppTemplatesPage() {
  return (
    <AppShell>
      <PageHeader title="Templates" />
      <TemplatesPanel />
    </AppShell>
  );
}
