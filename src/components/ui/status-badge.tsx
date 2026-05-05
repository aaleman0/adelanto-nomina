export type StatusTone = "neutral" | "success" | "warning" | "danger";

const toneClasses: Record<StatusTone, string> = {
  neutral: "bg-text-primary text-white",
  success: "bg-primary text-white",
  warning: "bg-link text-text-primary",
  danger: "bg-red-700 text-white",
};

export function StatusBadge({
  status,
  tone = "neutral",
}: {
  status: string;
  tone?: StatusTone;
}) {
  return (
    <span
      className={[
        "inline-flex rounded-base px-2 py-1 text-xs font-semibold",
        toneClasses[tone],
      ].join(" ")}
    >
      {status}
    </span>
  );
}
