import { Card, CardBody } from "@/components/ui/card";
import { Metric } from "@/components/ui/metric";
import type { ContractControlMetric, ContractControlMetricKey } from "@/lib/backoffice/contract-control";

const metricTone: Partial<Record<ContractControlMetricKey, "success" | "warning" | "danger" | "neutral">> = {
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
      {metrics.map((metric) => (
        <Card className="h-full transition hover:-translate-y-0.5 hover:shadow-md" key={metric.key}>
          <CardBody className="flex h-full items-center justify-center p-4">
            <Metric label={metric.label} value={metric.value} tone={metric.value > 0 ? metricTone[metric.key] ?? "neutral" : "neutral"} />
          </CardBody>
        </Card>
      ))}
    </section>
  );
}
