import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { BulkDetail } from "@/components/whatsapp/bulk-detail";
import Link from "next/link";

export default async function BulkDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <AppShell>
      <PageHeader
        title="Detalle de envío masivo"
        eyebrow="WhatsApp"
        description="Estado de entrega por empleado en este envío masivo."
        action={
          <Link
            href="/whatsapp/history"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-surface px-5 text-sm font-semibold text-text-primary transition hover:bg-surface-muted"
          >
            ← Volver al historial
          </Link>
        }
      />
      <BulkDetail id={id} />
    </AppShell>
  );
}
