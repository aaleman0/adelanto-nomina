import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { SearchInput } from "@/components/contracts/search-input";
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
  "h-10 w-full rounded-xl border border-border bg-surface px-3 text-[13px] font-normal text-text-primary outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20";

export function ContractControlFilters({
  filters,
  empleadores,
  total,
  visible,
  limit,
}: {
  filters: ContractControlFilters;
  empleadores: string[];
  total: number;
  visible: number;
  limit: number;
}) {
  return (
    <Card>
      <CardBody className="flex flex-col gap-4">
        <form className="grid gap-3 lg:grid-cols-[1fr_200px_200px_auto_auto]">
          <label className="flex flex-col gap-1.5 text-[12px] font-bold text-text-muted uppercase tracking-[0.1em]">
            Buscar
            <SearchInput defaultValue={filters.q} />
          </label>

          <label className="flex flex-col gap-1.5 text-[12px] font-bold text-text-muted uppercase tracking-[0.1em]">
            Estado
            <select
              className={selectCls}
              defaultValue={filters.status ?? "all"}
              name="status"
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5 text-[12px] font-bold text-text-muted uppercase tracking-[0.1em]">
            Empleador
            <select
              className={selectCls}
              defaultValue={filters.empleador ?? ""}
              name="empleador"
            >
              <option value="">Todos</option>
              {empleadores.map((empleador) => (
                <option key={empleador} value={empleador}>
                  {empleador}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-end">
            <Button type="submit">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Filtrar
            </Button>
          </div>

          <div className="flex items-end">
            <Link
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-text-muted transition hover:bg-surface-muted hover:text-text-primary"
              href="/contracts"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              Limpiar
            </Link>
          </div>
        </form>

        <div className="flex flex-col gap-1 border-t border-border/50 pt-3 text-[12px] text-text-muted md:flex-row md:items-center md:justify-between">
          <p>
            Mostrando{" "}
            <span className="font-bold text-text-primary">{visible}</span>{" "}
            de <span className="font-bold text-text-primary">{total}</span>{" "}
            resultados.
          </p>
          <p className="text-text-disabled">Límite operativo: {limit} registros por vista.</p>
        </div>
      </CardBody>
    </Card>
  );
}
