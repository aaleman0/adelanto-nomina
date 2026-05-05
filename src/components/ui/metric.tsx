export function Metric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number | string;
  tone?: "neutral" | "success";
}) {
  const labelColor = tone === "success" ? "text-primary" : "text-text-muted";

  return (
    <div>
      <p className={`text-xs font-semibold uppercase ${labelColor}`}>
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold text-text-primary">{value}</p>
    </div>
  );
}
