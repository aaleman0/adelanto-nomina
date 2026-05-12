export function Metric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number | string;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  const labelColor = {
    success: "text-primary",
    warning: "text-amber-700",
    danger: "text-red-700",
    neutral: "text-text-muted",
  }[tone];

  return (
    <div className="flex flex-col items-center justify-center text-center">
      <p className={`text-xs font-semibold uppercase ${labelColor}`}>
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold text-text-primary">{value}</p>
    </div>
  );
}
