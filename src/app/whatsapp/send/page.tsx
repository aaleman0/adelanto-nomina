import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { GuidedSendFlow } from "@/components/whatsapp/send-flow/guided-send-flow";
import Link from "next/link";

export default function WhatsAppSendPage() {
  return (
    <AppShell>
      <PageHeader
        title="Enviar mensajes"
        eyebrow="WhatsApp"
        description="Envía el mensaje de adelanto de nómina a empleados elegibles paso a paso."
        action={
          <Link
            href="/whatsapp/history"
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-text-primary shadow-sm transition hover:bg-surface-muted"
          >
            <svg className="h-4 w-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Historial de envíos
          </Link>
        }
      />
      <GuidedSendFlow />
    </AppShell>
  );
}
