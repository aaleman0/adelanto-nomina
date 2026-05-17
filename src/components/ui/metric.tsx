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
    neutral: "text-primary",
  }[tone];

  const dotColor = {
    success: "bg-emerald-500",
    warning: "bg-amber-500",
    danger: "bg-red-500",
    neutral: "bg-primary",
  }[tone];

  return (
    <div className="flex flex-col items-center justify-center text-center">
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`h-1.5 w-1.5 rounded-full ${dotColor} opacity-80`} />
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-text-muted leading-none">
          {label}
        </p>
      </div>
      <p className={`text-2xl font-bold leading-none ${valueColor}`}>{value}</p>
    </div>
  );
}
