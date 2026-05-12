import { StatusBadge, type StatusTone } from "./status-badge";

export type Priority = "high" | "medium" | "low" | "neutral";

const priorityTone: Record<Priority, StatusTone> = {
  high: "danger",
  medium: "warning",
  low: "success",
  neutral: "neutral",
};

export function StatusPriorityBadge({ status, priority }: { status: string; priority: Priority }) {
  return <StatusBadge status={status} tone={priorityTone[priority]} />;
}
