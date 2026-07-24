import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { BulkHistory } from "@/components/whatsapp/bulk-history";
import Link from "next/link";
import { LetterWave } from "@/components/ui/letter-wave";

export default function WhatsAppHistoryPage() {
  return (
    <AppShell>
      <PageHeader
        title="Historial"
        action={
          <Link
            href="/whatsapp/send"
            className="button-contrast inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--color-5)] px-4 text-sm font-semibold transition hover:-translate-y-0.5 hover:bg-[var(--color-4)] hover:shadow-md"
          >
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            <LetterWave>Nuevo envío</LetterWave>
          </Link>
        }
      />
      <BulkHistory />
    </AppShell>
  );
}
