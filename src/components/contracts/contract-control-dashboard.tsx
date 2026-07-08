import { Metric } from "@/components/ui/metric";
import type { ContractControlMetric, ContractControlMetricKey } from "@/lib/backoffice/contract-control";

const metricTone: Partial<Record<ContractControlMetricKey, "success" | "warning" | "danger" | "neutral" >> = {
  pendingSend: "warning",
  messageSent: "success",
  requested: "success",
  contractGenerated: "success",
  signed: "success",
  expired: "warning",
  errors: "danger",
};

export function ContractControlDashboard({ metrics }: { metrics: ContractControlMetric[] }) {
  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
      {metrics.map((metric) => {
        const tone = metric.value > 0 ? metricTone[metric.key] ?? "neutral" : "neutral";
        return (
          <Metric key={metric.key} label={metric.label} value={metric.value} tone={tone} />
        );
      })}
    </section>
  );
}
