import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { CycleDetailView } from "@/components/cycles/cycle-detail-view";
import { getCycleDetailData } from "@/lib/backoffice/cycles";
import type { StatusTone } from "@/components/ui/status-badge";

export const dynamic = "force-dynamic";

type CycleDetailPageProps = {
  params: Promise<{ cycleId: string }>;
  searchParams?: Promise<{ action_status?: string; nuevas?: string }>;
};

export default async function CycleDetailPage({ params, searchParams }: CycleDetailPageProps) {
  const { cycleId } = await params;
  const sp = await searchParams;

  const cycle = await getCycleDetailData(cycleId);
  if (!cycle) notFound();

  return (
    <AppShell>
      <CycleDetailView cycle={cycle} actionFeedback={getActionFeedback(sp?.action_status, sp?.nuevas)} />
    </AppShell>
  );
}

function getActionFeedback(
  status: string | undefined,
  nuevas: string | undefined,
): { tone: StatusTone; message: string } | undefined {
  if (status === "synced") {
    const n = Number(nuevas ?? "0");
    return {
      tone: "success",
      message:
        n > 0
          ? `Estados actualizados: ${n} ${n === 1 ? "firma nueva detectada" : "firmas nuevas detectadas"}.`
          : "Estados actualizados. No hay firmas nuevas desde la última revisión.",
    };
  }
  if (status === "sync_error") {
    return { tone: "warning", message: "Se actualizó parcialmente: algunos contratos no se pudieron consultar en EasyLex." };
  }
  if (status === "forbidden") {
    return { tone: "danger", message: "No tienes el rol necesario para esta acción (requiere operaciones)." };
  }
  return undefined;
}
