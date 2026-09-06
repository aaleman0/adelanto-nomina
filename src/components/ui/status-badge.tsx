export type StatusTone = "neutral" | "success" | "warning" | "danger";

// Estado como marca de forma + palabra (sin pastilla/caja). El color solo
// distingue; en neutral el punto es un aro hueco y el texto va apagado.
const dotClasses: Record<StatusTone, string> = {
  neutral: "border border-border-strong bg-transparent",
  success: "bg-primary",
  warning: "bg-warning",
  danger: "bg-danger",
};

const textClasses: Record<StatusTone, string> = {
  neutral: "text-text-muted",
  success: "text-primary",
  warning: "text-warning",
  danger: "text-danger",
};

export function StatusBadge({
  status,
  tone = "neutral",
}: {
  status: string;
  tone?: StatusTone;
}) {
  return (
    <span className={["inline-flex items-center gap-2 text-sm capitalize", textClasses[tone]].join(" ")}>
      <span className={["h-2 w-2 shrink-0 rounded-full", dotClasses[tone]].join(" ")} aria-hidden="true" />
      {status}
    </span>
  );
}
