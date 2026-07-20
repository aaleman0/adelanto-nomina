import Link from "next/link";
import Form from "next/form";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/contracts/search-input";
import { PaginationControls } from "@/components/ui/pagination-controls";
import type {
  ContractControlFilters,
  ContractOperationalStatus,
} from "@/lib/backoffice/contract-control";

const statusOptions: Array<{
  value: ContractOperationalStatus | "all";
  label: string;
}> = [
  { value: "all", label: "Todos" },
  { value: "pendiente_envio", label: "Pendiente envío" },
  { value: "mensaje_enviado", label: "Mensaje enviado" },
  { value: "solicitado", label: "Solicitado" },
  { value: "contrato_en_proceso", label: "Contrato en proceso" },
  { value: "contrato_generado", label: "Contrato generado" },
  { value: "link_expirado", label: "Link expirado" },
  { value: "firmado", label: "Firmado" },
  { value: "error", label: "Error" },
  { value: "no_elegible", label: "No elegible" },
];

const selectCls =
  "h-10 w-full rounded-lg border border-border bg-white/70 px-3 text-sm text-text-primary outline-none transition focus:border-primary focus:bg-white";

export function ContractControlFilters({
  filters,
  empleadores,
  total,
  limit,
  page,
  totalPages,
}: {
  filters: ContractControlFilters;
  empleadores: string[];
  total: number;
  limit: number;
  page: number;
  totalPages: number;
}) {
  const activeParams: Record<string, string> = {};
  if (filters.q) activeParams.q = filters.q;
  if (filters.status && filters.status !== "all") activeParams.status = filters.status;
  if (filters.empleador) activeParams.empleador = filters.empleador;

  return (
    <div className="surface-panel shrink-0 rounded-xl p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="font-display text-base font-semibold text-text-primary">Buscar contratos</h2><p className="text-xs text-text-muted">Encuentra por nombre, teléfono o RFC.</p></div>{Object.keys(activeParams).length > 0 ? <Link className="text-xs font-semibold text-primary hover:text-primary-hover" href="/contracts">Quitar filtros</Link> : null}</div>
      <Form action="/contracts" className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <label className="flex flex-1 flex-col gap-1.5 text-sm font-medium text-text-muted">
          Buscar
          <SearchInput defaultValue={filters.q} />
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium text-text-muted lg:w-44">
          Estado
          <select className={selectCls} defaultValue={filters.status ?? "all"} name="status">
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium text-text-muted lg:w-52">
          Empleador
          <select className={selectCls} defaultValue={filters.empleador ?? ""} name="empleador">
            <option value="">Todos</option>
            {empleadores.map((empleador) => (
              <option key={empleador} value={empleador}>
                {empleador}
              </option>
            ))}
          </select>
        </label>

        <div className="flex gap-2">
          <Button type="submit">Aplicar filtros</Button>
          <Link
            className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-surface px-4 text-sm font-medium text-text-muted transition hover:bg-surface-muted hover:text-text-primary"
            href="/contracts"
          >
            Restablecer
          </Link>
        </div>
      </Form>

      <div className="mt-4 border-t border-border pt-4"><PaginationControls
        page={page}
        totalPages={totalPages}
        total={total}
        limit={limit}
        baseHref="/contracts"
        currentParams={activeParams}
      /></div>
    </div>
  );
}
