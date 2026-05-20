import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { TemplatesPanel } from "@/components/whatsapp/templates-panel";

export default function WhatsAppTemplatesPage() {
  return (
    <AppShell>
      <PageHeader
        title="Templates de WhatsApp"
        eyebrow="WhatsApp · Templates"
        description="Sincroniza y revisa los templates aprobados en Meta Business. Solo los templates con estado APPROVED pueden usarse para envíos masivos."
      />
      <TemplatesPanel />
    </AppShell>
  );
}
