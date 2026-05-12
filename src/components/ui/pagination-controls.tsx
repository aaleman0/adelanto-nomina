import Link from "next/link";

export function PaginationControls({
  total,
  visible,
  limit,
  baseHref,
}: {
  total: number;
  visible: number;
  limit: number;
  baseHref: string;
}) {
  return (
    <div className="flex flex-col gap-2 border-t border-border px-5 py-4 text-sm text-text-muted sm:flex-row sm:items-center sm:justify-between">
      <p>
        Mostrando <span className="font-semibold text-text-primary">{visible}</span> de <span className="font-semibold text-text-primary">{total}</span>. Límite visible: {limit}.
      </p>
      <div className="flex gap-2">
        <Link className="rounded-base border border-border bg-surface px-3 py-2 font-semibold text-text-primary opacity-50" href={baseHref}>Anterior</Link>
        <Link className="rounded-base border border-border bg-surface px-3 py-2 font-semibold text-text-primary opacity-50" href={baseHref}>Siguiente</Link>
      </div>
    </div>
  );
}
