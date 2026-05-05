import { Card, CardBody } from "@/components/ui/card";
import { Metric } from "@/components/ui/metric";
import type { ContractControlMetric } from "@/lib/backoffice/contract-control";

export function ContractControlDashboard({
  metrics,
}: {
  metrics: ContractControlMetric[];
}) {
  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
      {metrics.map((metric) => (
        <Card key={metric.key}>
          <CardBody className="p-4">
            <Metric
              label={metric.label}
              value={metric.value}
              tone={metric.value > 0 ? "success" : "neutral"}
            />
          </CardBody>
        </Card>
      ))}
    </section>
  );
}
