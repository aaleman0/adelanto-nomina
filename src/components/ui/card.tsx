import type { HTMLAttributes } from "react";

export function Card({ className = "", ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={[
        "rounded-2xl border border-border bg-surface shadow-sm",
        className,
      ].join(" ")}
      {...props}
    />
  );
}

export function CardHeader({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={["border-b border-border/60 px-6 py-5", className].join(" ")}
      {...props}
    />
  );
}

export function CardBody({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={["p-6", className].join(" ")} {...props} />;
}
