import Link from "next/link";

/**
 * Construye una URL de paginación preservando todos los searchParams existentes
 * y sobreescribiendo solo el parámetro `page`.
 */
function buildPageUrl(baseHref: string, currentParams: Record<string, string>, page: number): string {
  const params = new URLSearchParams(currentParams);
  if (page === 1) {
    params.delete("page");
  } else {
    params.set("page", String(page));
  }
  const qs = params.toString();
  return qs ? `${baseHref}?${qs}` : baseHref;
}

/**
 * Genera la lista de páginas a mostrar con elipsis cuando hay muchas.
 * Siempre muestra: primera, última, página actual y sus vecinas inmediatas.
 *
 * Ejemplo con 10 páginas en página 5:
 *   [1, "...", 4, 5, 6, "...", 10]
 */
function buildPageWindows(page: number, totalPages: number): Array<number | "..."> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages: Array<number | "..."> = [];
  const neighbors = new Set([1, totalPages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= totalPages));
  let prev: number | null = null;

  for (const p of Array.from(neighbors).sort((a, b) => a - b)) {
    if (prev !== null && p - prev > 1) pages.push("...");
    pages.push(p);
    prev = p;
  }

  return pages;
}

const baseBtnCls =
  "inline-flex h-8 min-w-[2rem] items-center justify-center rounded-md border px-2.5 text-xs font-medium transition";

const activeBtnCls = `${baseBtnCls} border-primary bg-primary text-white`;
const defaultBtnCls = `${baseBtnCls} border-border bg-surface text-text-muted hover:border-primary hover:text-text-primary`;
const disabledBtnCls = `${baseBtnCls} border-border bg-surface-muted text-text-disabled cursor-not-allowed pointer-events-none`;

export function PaginationControls({
  page,
  totalPages,
  total,
  limit,
  baseHref,
  currentParams = {},
}: {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  baseHref: string;
  /** SearchParams actuales (sin `page`) para preservarlos en los links. */
  currentParams?: Record<string, string>;
}) {
  const hasPrev = page > 1;
  const hasNext = page < totalPages;
  const pageWindows = buildPageWindows(page, totalPages);

  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div className="flex flex-col gap-3 border-t border-border/60 px-2 py-4 sm:flex-row sm:items-center sm:justify-between">
      {/* Contador */}
      <p className="text-[12px] text-text-muted">
        {total === 0 ? (
          "Sin resultados."
        ) : (
          <>
            Mostrando{" "}
            <span className="font-bold text-text-primary">{from}–{to}</span>{" "}
            de <span className="font-bold text-text-primary">{total}</span>{" "}
            {totalPages > 1 && (
              <span className="text-text-disabled">· Página {page} de {totalPages}</span>
            )}
          </>
        )}
      </p>

      {/* Controles — solo se muestran si hay más de una página */}
      {totalPages > 1 && (
        <nav className="flex items-center gap-1" aria-label="Paginación">
          {/* Anterior */}
          {hasPrev ? (
            <Link
              href={buildPageUrl(baseHref, currentParams, page - 1)}
              className={defaultBtnCls}
              aria-label="Página anterior"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
          ) : (
            <span className={disabledBtnCls} aria-disabled="true">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </span>
          )}

          {/* Números de página */}
          {pageWindows.map((p, i) =>
            p === "..." ? (
              <span key={`ellipsis-${i}`} className="px-1 text-[12px] text-text-disabled select-none">
                …
              </span>
            ) : p === page ? (
              <span key={p} className={activeBtnCls} aria-current="page">
                {p}
              </span>
            ) : (
              <Link
                key={p}
                href={buildPageUrl(baseHref, currentParams, p)}
                className={defaultBtnCls}
                aria-label={`Página ${p}`}
              >
                {p}
              </Link>
            ),
          )}

          {/* Siguiente */}
          {hasNext ? (
            <Link
              href={buildPageUrl(baseHref, currentParams, page + 1)}
              className={defaultBtnCls}
              aria-label="Página siguiente"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          ) : (
            <span className={disabledBtnCls} aria-disabled="true">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </span>
          )}
        </nav>
      )}
    </div>
  );
}
