import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { BulkHistory } from "@/components/whatsapp/bulk-history";
import Link from "next/link";

export default function WhatsAppHistoryPage() {
  return (
    <AppShell>
      <PageHeader
        title="Historial de envíos"
        eyebrow="WhatsApp"
        description="Todos los envíos masivos realizados vía WhatsApp API."
        action={
          <Link
            href="/whatsapp/send"
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 text-sm font-semibold text-white shadow-sm shadow-indigo-300 transition hover:from-indigo-700 hover:to-violet-700"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
