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
    success: "text-emerald-600",
    warning: "text-amber-600",
    danger: "text-red-600",
    neutral: "text-text-primary",
  }[tone];

  return (
    <div>
      <p className="text-sm text-text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tracking-tight ${valueColor}`}>{value}</p>
    </div>
  );
}
