import type { ContractControlMetric } from "@/lib/backoffice/contract-control";

export function ContractControlDashboard({ metrics }: { metrics: ContractControlMetric[] }) {
  const metricMap = new Map(metrics.map((metric) => [metric.key, metric.value]));
  const signed = metricMap.get("signed") ?? 0;
  const errors = metricMap.get("errors") ?? 0;
  const attention = (metricMap.get("pendingSend") ?? 0) + (metricMap.get("expired") ?? 0);

  return (
    <section className="surface-panel grid min-h-[92px] shrink-0 divide-y divide-border overflow-hidden rounded-xl sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      <SummaryMetric label="Requieren atención" value={attention} tone={attention > 0 ? "warning" : "success"} hint="Pendientes o con link vencido" />
      <SummaryMetric label="Con error" value={errors} tone={errors > 0 ? "danger" : "success"} hint="Revisar antes de reintentar" />
      <SummaryMetric label="Firmados" value={signed} tone="success" hint="Proceso completado" />
    </section>
  );
}

function SummaryMetric({ label, value, tone, hint }: { label: string; value: number; tone: "success" | "warning" | "danger"; hint: string }) {
  const dot = { success: "bg-success", warning: "bg-warning", danger: "bg-danger" }[tone];
  return (
    <div className="flex min-h-[92px] items-center gap-4 px-5 py-4">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />
      <div className="min-w-0">
        <div className="flex items-baseline gap-2"><strong className="font-data text-2xl leading-none text-text-primary">{value}</strong><span className="text-sm font-semibold text-text-primary">{label}</span></div>
        <p className="mt-1 whitespace-normal text-xs leading-4 text-text-muted">{hint}</p>
      </div>
    </div>
  );
}
