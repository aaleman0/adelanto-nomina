export type StatusTone = "neutral" | "success" | "warning" | "danger";

const toneClasses: Record<StatusTone, string> = {
  neutral: "bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200/60",
  success: "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200/60",
  warning: "bg-amber-100 text-amber-700 ring-1 ring-amber-200/60",
  danger: "bg-red-100 text-red-700 ring-1 ring-red-200/60",
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
        "inline-flex items-center rounded-lg px-2.5 py-1 text-[11px] font-bold leading-none capitalize",
        toneClasses[tone],
      ].join(" ")}
    >
      {status}
    </span>
  );
}
