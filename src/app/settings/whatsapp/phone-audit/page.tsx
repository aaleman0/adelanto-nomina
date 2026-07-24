import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { PhoneAuditPanel } from "@/components/whatsapp/phone-audit-panel";
import Link from "next/link";

export default function PhoneAuditPage() {
  return (
    <AppShell>
      <PageHeader
        title="Auditoría de teléfonos"
        action={
          <Link
            href="/settings/whatsapp"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-4 text-sm font-medium text-text-primary transition hover:bg-surface-muted"
          >
            <svg className="h-4 w-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            Volver
          </Link>
        }
      />
      <PhoneAuditPanel />
    </AppShell>
  );
}
