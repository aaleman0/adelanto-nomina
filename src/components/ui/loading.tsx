import type { HTMLAttributes } from "react";

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <div
      className={[
        "inline-block h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent",
        className,
      ].join(" ")}
      aria-label="Cargando"
    />
  );
}

export function Skeleton({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={[
        "animate-pulse rounded-md bg-surface-muted",
        className,
      ].join(" ")}
      {...props}
    />
  );
}

export function PageSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-fade-up">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
