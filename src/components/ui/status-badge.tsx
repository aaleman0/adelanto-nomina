export type StatusTone = "neutral" | "success" | "warning" | "danger";

const toneClasses: Record<StatusTone, string> = {
  neutral: "bg-neutral text-white",
  success: "bg-success text-white",
  warning: "bg-warning text-white",
  danger: "bg-danger text-white",
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
