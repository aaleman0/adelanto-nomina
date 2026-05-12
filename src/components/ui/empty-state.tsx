import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-base border border-dashed border-border bg-surface-muted px-5 py-8 text-center">
      <p className="font-semibold text-text-primary">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-text-muted">{description}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
