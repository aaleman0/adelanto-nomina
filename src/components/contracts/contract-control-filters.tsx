import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import type {
  ContractControlFilters,
  ContractOperationalStatus,
} from "@/lib/backoffice/contract-control";

const statusOptions: Array<{
  value: ContractOperationalStatus | "all";
  label: string;
}> = [
  { value: "all", label: "Todos" },
  { value: "pendiente_envio", label: "Pendiente envio" },
  { value: "mensaje_enviado", label: "Mensaje enviado" },
  { value: "solicitado", label: "Solicitado" },
  { value: "contrato_en_proceso", label: "Contrato en proceso" },
  { value: "contrato_generado", label: "Contrato generado" },
  { value: "link_expirado", label: "Link expirado" },
  { value: "firmado", label: "Firmado" },
  { value: "error", label: "Error" },
  { value: "no_elegible", label: "No elegible" },
];

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
        <form className="grid gap-4 lg:grid-cols-[1fr_220px_220px_auto_auto]">
          <label className="flex flex-col gap-2 text-sm font-semibold text-text-primary">
            Buscar
            <input
              className="h-10 rounded-base border border-border bg-surface px-3 text-sm font-normal text-text-primary outline-none focus:border-primary"
              defaultValue={filters.q ?? ""}
              name="q"
              placeholder="RFC, teléfono, nombre o subscriber"
              type="search"
            />
          </label>

          <label className="flex flex-col gap-2 text-sm font-semibold text-text-primary">
            Estado
            <select
              className="h-10 rounded-base border border-border bg-surface px-3 text-sm font-normal text-text-primary outline-none focus:border-primary"
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

          <label className="flex flex-col gap-2 text-sm font-semibold text-text-primary">
            Empleador
            <select
              className="h-10 rounded-base border border-border bg-surface px-3 text-sm font-normal text-text-primary outline-none focus:border-primary"
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
            <Button type="submit">Filtrar</Button>
          </div>

          <div className="flex items-end">
            <Link
              className="inline-flex h-10 items-center justify-center rounded-base border border-border bg-surface px-4 text-sm font-semibold text-text-primary hover:bg-surface-muted"
              href="/contracts"
            >
              Limpiar
            </Link>
          </div>
        </form>

        <div className="flex flex-col gap-1 text-sm text-text-muted md:flex-row md:items-center md:justify-between">
          <p>
            Mostrando <span className="font-semibold text-text-primary">{visible}</span>{" "}
            de <span className="font-semibold text-text-primary">{total}</span>{" "}
            resultados.
          </p>
          <p>Límite operativo actual: {limit} registros por vista.</p>
        </div>
      </CardBody>
    </Card>
  );
}
