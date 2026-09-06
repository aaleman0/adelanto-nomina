// Métrica editorial: etiqueta pequeña en versalitas + número grande. Sin caja.
// El color solo aparece en tonos semánticos; neutral es tinta.
export function Metric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number | string;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  const valueColor = {
    success: "text-primary",
    warning: "text-warning",
    danger: "text-danger",
    neutral: "text-text-primary",
  }[tone];

  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.16em] text-text-muted">{label}</p>
      <p className={`mt-3 text-4xl font-bold leading-none tracking-tight tabular-nums ${valueColor}`}>{value}</p>
    </div>
  );
}
