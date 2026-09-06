import type {
  HTMLAttributes,
  ReactNode,
  TableHTMLAttributes,
  TdHTMLAttributes,
  ThHTMLAttributes,
} from "react";

// Tabla tipográfica: sin caja contenedora, encabezado en versalitas con
// interletraje y filas separadas por líneas finas (los `<tr>` llevan la línea).
export function DataTable({ className = "", ...props }: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto">
      <table
        className={["w-full min-w-[680px] border-collapse text-left text-sm", className].join(" ")}
        {...props}
      />
    </div>
  );
}

export function DataTableHead({ className = "", ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={[
        "border-b border-border-strong text-left text-[11px] font-medium uppercase tracking-[0.12em] text-text-muted",
        className,
      ].join(" ")}
      {...props}
    />
  );
}

export function DataTableHeaderCell({ className = "", ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={["px-4 py-3 font-medium", className].join(" ")} {...props} />;
}

export function DataTableCell({ className = "", ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={["px-4 py-4 align-baseline", className].join(" ")} {...props} />;
}

export function DataTableEmpty({ children, colSpan }: { children: ReactNode; colSpan: number }) {
  return (
    <tr>
      <DataTableCell className="py-16 text-center text-text-muted" colSpan={colSpan}>
        {children}
      </DataTableCell>
    </tr>
  );
}
