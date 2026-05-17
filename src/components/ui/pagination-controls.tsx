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
    <div className="flex flex-col gap-2 border-t border-border/60 bg-surface-muted/30 px-6 py-4 text-sm text-text-muted sm:flex-row sm:items-center sm:justify-between">
      <p className="text-[13px]">
        Mostrando{" "}
        <span className="font-bold text-text-primary">{visible}</span> de{" "}
        <span className="font-bold text-text-primary">{total}</span>.{" "}
        <span className="text-text-disabled">Límite: {limit}</span>
      </p>
      <div className="flex gap-2">
        <Link
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-[12px] font-semibold text-text-muted opacity-50 transition hover:opacity-70"
          href={baseHref}
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Anterior
        </Link>
        <Link
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-[12px] font-semibold text-text-muted opacity-50 transition hover:opacity-70"
          href={baseHref}
        >
          Siguiente
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>
    </div>
  );
}
