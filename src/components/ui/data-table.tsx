import type {
  HTMLAttributes,
  ReactNode,
  TableHTMLAttributes,
  TdHTMLAttributes,
  ThHTMLAttributes,
} from "react";

export function DataTable({
  className = "",
  ...props
}: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto">
      <table
        className={[
          "w-full min-w-[880px] border-collapse text-left text-[13px]",
          className,
        ].join(" ")}
        {...props}
      />
    </div>
  );
}

export function DataTableHead({
  className = "",
  ...props
}: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={[
        "bg-surface-muted/80 text-[11px] uppercase tracking-[0.08em] text-text-muted border-b border-border",
        className,
      ].join(" ")}
      {...props}
    />
  );
}

export function DataTableHeaderCell({
  className = "",
  ...props
}: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={["px-4 py-3.5 font-bold", className].join(" ")}
      {...props}
    />
  );
}

export function DataTableCell({
  className = "",
  ...props
}: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={["px-4 py-3", className].join(" ")} {...props} />;
}

export function DataTableEmpty({
  children,
  colSpan,
}: {
  children: ReactNode;
  colSpan: number;
}) {
  return (
    <tr>
      <DataTableCell
        className="py-12 text-center text-text-muted"
        colSpan={colSpan}
      >
        <div className="flex flex-col items-center gap-2">
          <svg className="h-8 w-8 text-border-strong opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
          <span className="text-sm">{children}</span>
        </div>
      </DataTableCell>
    </tr>
  );
}
