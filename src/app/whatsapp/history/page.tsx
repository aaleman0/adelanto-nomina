import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { BulkHistory } from "@/components/whatsapp/bulk-history";
import Link from "next/link";

export default function WhatsAppHistoryPage() {
  return (
    <AppShell>
      <PageHeader
        title="Historial"
        action={
          <Link
            href="/whatsapp/send"
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-white transition hover:bg-primary-hover"
          >
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Nuevo envío
          </Link>
        }
      />
      <BulkHistory />
    </AppShell>
  );
}
