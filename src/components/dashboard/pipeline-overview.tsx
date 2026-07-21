import Link from "next/link";
import type { ContractControlMetric, ContractControlMetricKey } from "@/lib/backoffice/contract-control";
import { StageBatchSend } from "./stage-batch-send";
import { StageBatchAction } from "./stage-batch-action";

/**
 * Embudo de conversión — la pieza ancla del rediseño por flujo.
 *
 * En vez de organizar la app por herramientas (Importar, WhatsApp, Contratos),
 * el operador ve el recorrido real del empleado como un embudo: Por contactar →
 * En proceso → Contrato listo → Firmados. Cada etapa muestra cuántos hay y
 * lleva al archivo filtrado por ese estado, así el modelo mental es el flujo,
 * no las secciones.
 *
 * Los estados que se salen del camino feliz (error, link vencido) se muestran
 * aparte como "requieren atención", porque son desvíos, no etapas.
 */

function metricValue(metrics: ContractControlMetric[], key: ContractControlMetricKey): number {
  return metrics.find((metric) => metric.key === key)?.value ?? 0;
}

type Stage = {
  label: string;
  value: number;
  href: string;
  /** Estado al que se puede enviar en lote desde esta etapa (solo Por contactar). */
  batchStatus?: string;
};

export function PipelineOverview({
  metrics,
  signed,
  total,
}: {
  metrics: ContractControlMetric[];
  signed: number;
  total: number;
}) {
  const porContactar = metricValue(metrics, "pendingSend");
  const enProceso = metricValue(metrics, "messageSent") + metricValue(metrics, "requested");
  const contratoListo = metricValue(metrics, "contractGenerated");
  const firmados = metricValue(metrics, "signed");
  const errores = metricValue(metrics, "errors");
  const vencidos = metricValue(metrics, "expired");

  // El camino feliz, en orden de avance por el embudo.
  const stages: Stage[] = [
    { label: "Por contactar", value: porContactar, href: "/contracts?status=pendiente_envio", batchStatus: "pendiente_envio" },
    { label: "En proceso", value: enProceso, href: "/contracts?status=mensaje_enviado" },
    { label: "Contrato listo", value: contratoListo, href: "/contracts?status=contrato_generado" },
    { label: "Firmados", value: firmados, href: "/contracts?status=firmado" },
  ];

  // Desvíos: solo se muestran si existen, para no gritar cuando todo va bien.
  const attention = [
    { label: "Con error", value: errores, href: "/contracts?status=error", tone: "danger" as const, status: "error" as const, actionLabel: "Reintentar todos", noun: "reintentarán" },
    { label: "Link vencido", value: vencidos, href: "/contracts?status=link_expirado", tone: "warning" as const, status: "link_expirado" as const, actionLabel: "Regenerar todos", noun: "regenerarán" },
  ].filter((item) => item.value > 0);

  const conversion = total > 0 ? Math.round((signed / total) * 100) : 0;

  return (
    <section className="surface-panel shrink-0 rounded-xl p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-data text-[10px] uppercase tracking-[.16em] text-text-muted">Embudo de conversión</p>
        <p className="text-xs text-text-muted">
          <span className="font-data text-sm font-semibold text-text-primary">{conversion}%</span> firmados · {signed} de {total} elegibles
        </p>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-stretch">
        {stages.map((stage, index) => (
          <div key={stage.label} className="flex flex-1 items-stretch gap-2">
            <StageCard stage={stage} isLast={index === stages.length - 1} />
            {index < stages.length - 1 && (
              <span className="hidden shrink-0 items-center text-text-disabled sm:flex" aria-hidden>
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" /></svg>
              </span>
            )}
          </div>
        ))}
      </div>

      {attention.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border-subtle pt-3">
          <span className="font-data text-[10px] uppercase tracking-[.14em] text-text-muted">Requieren atención</span>
          {attention.map((item) => (
            <span key={item.label} className="inline-flex items-center gap-2">
              <Link
                href={item.href}
                className={[
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition hover:-translate-y-0.5",
                  item.tone === "danger" ? "bg-danger-bg text-danger" : "bg-warning-bg text-warning",
                ].join(" ")}
              >
                <span className="font-data">{item.value}</span> {item.label}
              </Link>
              <StageBatchAction
                status={item.status}
                count={item.value}
                label={item.label}
                actionLabel={item.actionLabel}
                noun={item.noun}
              />
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

function StageCard({ stage, isLast }: { stage: Stage; isLast: boolean }) {
  const cardClass = [
    "flex flex-1 flex-col rounded-lg border px-3 py-2.5 transition",
    isLast ? "border-[var(--success)]/30 bg-success-bg/40" : "border-border bg-surface",
  ].join(" ");

  // El botón de envío es interactivo, así que no puede vivir dentro de un
  // <Link>. Cuando la etapa tiene acción en lote, el drill-down es un enlace
  // interno (la etiqueta y el número) y el botón va aparte.
  const drill = (
    <Link href={stage.href} className="group block">
      <span className="text-[11px] font-medium text-text-muted group-hover:text-text-secondary">{stage.label}</span>
      <span className={["font-data mt-1 block text-2xl font-semibold", isLast ? "text-success" : "text-text-primary"].join(" ")}>{stage.value}</span>
    </Link>
  );

  if (stage.batchStatus) {
    return (
      <div className={cardClass}>
        {drill}
        <StageBatchSend status={stage.batchStatus} count={stage.value} label={stage.label} />
      </div>
    );
  }

  return (
    <Link href={stage.href} className={[cardClass, "group justify-between hover:-translate-y-0.5 hover:shadow-sm", isLast ? "" : "hover:bg-surface-muted"].join(" ")}>
      <span className="text-[11px] font-medium text-text-muted group-hover:text-text-secondary">{stage.label}</span>
      <span className={["font-data mt-1 text-2xl font-semibold", isLast ? "text-success" : "text-text-primary"].join(" ")}>{stage.value}</span>
    </Link>
  );
}
