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
          "w-full min-w-[880px] border-collapse text-left text-body",
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
        "bg-surface-muted text-xs uppercase text-text-muted",
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
      className={["px-4 py-3 font-semibold", className].join(" ")}
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
        className="py-8 text-center text-text-muted"
        colSpan={colSpan}
      >
        {children}
      </DataTableCell>
    </tr>
  );
}
