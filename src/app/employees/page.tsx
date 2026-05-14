import Link from "next/link";
import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import {
  DataTable,
  DataTableCell,
  DataTableEmpty,
  DataTableHead,
  DataTableHeaderCell,
} from "@/components/ui/data-table";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type EmployeeRow = {
  employee_id: string;
  empleado: string | null;
  rfc: string | null;
  telefono_normalizado: string | null;
  email: string | null;
  empleador: string | null;
  monto_prestamo_autorizado: number | null;
  is_eligible: boolean | null;
  offer_status: string | null;
  operational_status: string | null;
  last_movement_at: string | null;
};

type EmployeesPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function EmployeesPage({ searchParams }: EmployeesPageProps) {
  const resolvedParams = await searchParams;
  const q = getSingleParam(resolvedParams?.q)?.trim() || undefined;
  const empleador = getSingleParam(resolvedParams?.empleador)?.trim() || undefined;
  const eligibleOnly = getSingleParam(resolvedParams?.eligible) === "1";

  const result = await getEmployeesData({ q, empleador, eligibleOnly });

  return (
    <AppShell>
      <PageHeader
        title="Empleados / ofertas"
        description="Catálogo de empleados importados con su oferta vigente, elegibilidad y estado operativo actual."
      />
      {result.setupError ? (
        <section className="rounded-base border border-red-200 bg-red-50 p-5 text-sm text-red-800">
          <p className="font-semibold">No se pudo leer empleados</p>
          <p className="mt-2">{result.setupError}</p>
        </section>
      ) : null}
      <EmployeeFilters
        q={q}
        empleador={empleador}
        eligibleOnly={eligibleOnly}
        empleadores={result.empleadores}
        total={result.total}
        visible={result.rows.length}
      />
      <EmployeeTable rows={result.rows} />
    </AppShell>
  );
}

function EmployeeFilters({
  q,
  empleador,
  eligibleOnly,
  empleadores,
  total,
  visible,
}: {
  q?: string;
  empleador?: string;
  eligibleOnly: boolean;
  empleadores: string[];
  total: number;
  visible: number;
}) {
  return (
    <Card>
      <CardBody className="flex flex-col gap-4">
        <form className="grid gap-4 lg:grid-cols-[1fr_220px_180px_auto_auto]">
          <label className="flex flex-col gap-2 text-sm font-semibold text-text-primary">
            Buscar
            <input
              className="h-10 rounded-base border border-border bg-surface px-3 text-sm font-normal text-text-primary outline-none focus:border-primary"
              defaultValue={q ?? ""}
              name="q"
              placeholder="Nombre, RFC o teléfono"
              type="search"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm font-semibold text-text-primary">
            Empleador
            <select
              className="h-10 rounded-base border border-border bg-surface px-3 text-sm font-normal text-text-primary outline-none focus:border-primary"
              defaultValue={empleador ?? ""}
              name="empleador"
            >
              <option value="">Todos</option>
              {empleadores.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm font-semibold text-text-primary">
            Elegibilidad
            <select
              className="h-10 rounded-base border border-border bg-surface px-3 text-sm font-normal text-text-primary outline-none focus:border-primary"
              defaultValue={eligibleOnly ? "1" : ""}
              name="eligible"
            >
              <option value="">Todos</option>
              <option value="1">Solo elegibles</option>
            </select>
          </label>
          <div className="flex items-end">
            <button
              className="h-10 rounded-base bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary-strong"
              type="submit"
            >
              Filtrar
            </button>
          </div>
          <div className="flex items-end">
            <Link
              className="inline-flex h-10 items-center justify-center rounded-base border border-border bg-surface px-4 text-sm font-semibold text-text-primary hover:bg-surface-muted"
              href="/employees"
            >
              Limpiar
            </Link>
          </div>
        </form>
        <div className="flex flex-col gap-1 text-sm text-text-muted md:flex-row md:items-center md:justify-between">
          <p>
            Mostrando <span className="font-semibold text-text-primary">{visible}</span>{" "}
            de <span className="font-semibold text-text-primary">{total}</span> empleados.
          </p>
          <p>Límite operativo: 100 registros por vista.</p>
        </div>
      </CardBody>
    </Card>
  );
}

function EmployeeTable({ rows }: { rows: EmployeeRow[] }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <h2 className="text-h2 font-semibold text-text-primary">Catálogo de empleados</h2>
        <p className="mt-1 text-sm text-text-muted">
          Empleados importados con oferta vigente. Haz clic en "Ver contrato" para ir al detalle operativo.
        </p>
      </CardHeader>

      {/* Tabla desktop */}
      <div className="hidden lg:block">
        <DataTable className="min-w-[860px]">
          <DataTableHead>
            <tr>
              <DataTableHeaderCell>Empleado</DataTableHeaderCell>
              <DataTableHeaderCell>RFC</DataTableHeaderCell>
              <DataTableHeaderCell>Teléfono</DataTableHeaderCell>
              <DataTableHeaderCell>Empleador</DataTableHeaderCell>
              <DataTableHeaderCell>Monto oferta</DataTableHeaderCell>
              <DataTableHeaderCell>Elegible</DataTableHeaderCell>
              <DataTableHeaderCell>Estado oferta</DataTableHeaderCell>
              <DataTableHeaderCell>Estado contrato</DataTableHeaderCell>
              <DataTableHeaderCell>Último mov.</DataTableHeaderCell>
              <DataTableHeaderCell>Acciones</DataTableHeaderCell>
            </tr>
          </DataTableHead>
          <tbody>
            {rows.length > 0 ? rows.map((row) => (
              <tr className="border-t border-border/70 transition hover:bg-surface-muted/50" key={row.employee_id}>
                <DataTableCell className="font-medium text-text-primary">
                  {row.empleado || "-"}
                </DataTableCell>
                <DataTableCell>{row.rfc || "-"}</DataTableCell>
                <DataTableCell>{row.telefono_normalizado || "-"}</DataTableCell>
                <DataTableCell>{row.empleador || "-"}</DataTableCell>
                <DataTableCell>{formatMoney(row.monto_prestamo_autorizado)}</DataTableCell>
                <DataTableCell>
                  <StatusBadge
                    status={row.is_eligible ? "Elegible" : "No elegible"}
                    tone={row.is_eligible ? "success" : "neutral"}
                  />
                </DataTableCell>
                <DataTableCell>
                  <StatusBadge
                    status={formatStatus(row.offer_status)}
                    tone={getOfferStatusTone(row.offer_status)}
                  />
                </DataTableCell>
                <DataTableCell>
                  <StatusBadge
                    status={formatStatus(row.operational_status)}
                    tone={getOperationalStatusTone(row.operational_status)}
                  />
                </DataTableCell>
                <DataTableCell className="text-text-muted">
                  {formatDate(row.last_movement_at)}
                </DataTableCell>
                <DataTableCell>
                  <Link
                    className="inline-flex h-8 items-center rounded-base border border-border px-3 text-xs font-semibold text-text-primary hover:bg-surface-muted"
                    href={`/contracts/${row.employee_id}`}
                  >
                    Ver contrato
                  </Link>
                </DataTableCell>
              </tr>
            )) : (
              <DataTableEmpty colSpan={10}>
                No se encontraron empleados con los filtros aplicados.
              </DataTableEmpty>
            )}
          </tbody>
        </DataTable>
      </div>

      {/* Cards móvil */}
      <div className="grid gap-3 p-4 lg:hidden">
        {rows.length > 0 ? rows.map((row) => (
          <Link
            className="rounded-base border border-border bg-surface p-4 transition hover:border-primary"
            href={`/contracts/${row.employee_id}`}
            key={row.employee_id}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-text-primary">{row.empleado || "Empleado sin nombre"}</p>
                <p className="text-sm text-text-muted">{row.rfc || "Sin RFC"} · {row.empleador || "Sin empleador"}</p>
              </div>
              <StatusBadge
                status={row.is_eligible ? "Elegible" : "No elegible"}
                tone={row.is_eligible ? "success" : "neutral"}
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <StatusBadge status={formatStatus(row.offer_status)} tone={getOfferStatusTone(row.offer_status)} />
              <StatusBadge status={formatStatus(row.operational_status)} tone={getOperationalStatusTone(row.operational_status)} />
              <span className="text-xs text-text-muted self-center">{formatMoney(row.monto_prestamo_autorizado)}</span>
            </div>
          </Link>
        )) : (
          <p className="rounded-base border border-border bg-surface-muted p-6 text-center text-sm text-text-muted">
            No se encontraron empleados con los filtros aplicados.
          </p>
        )}
      </div>
    </Card>
  );
}

async function getEmployeesData({
  q,
  empleador,
  eligibleOnly,
}: {
  q?: string;
  empleador?: string;
  eligibleOnly: boolean;
}) {
  try {
    const supabase = getSupabaseAdmin();
    const limit = 100;

    let dataQuery = supabase
      .from("backoffice_contract_control_v1")
      .select(
        "employee_id, empleado, rfc, telefono_normalizado, email, empleador, monto_prestamo_autorizado, is_eligible, offer_status, operational_status, last_movement_at",
      );

    let countQuery = supabase
      .from("backoffice_contract_control_v1")
      .select("employee_id", { count: "exact", head: true });

    if (q) {
      const term = q.replace(/[%_,]/g, "");
      const orClause = [
        `empleado.ilike.%${term}%`,
        `rfc.ilike.%${term}%`,
        `telefono_normalizado.ilike.%${term}%`,
      ].join(",");
      dataQuery = dataQuery.or(orClause);
      countQuery = countQuery.or(orClause);
    }

    if (empleador) {
      dataQuery = dataQuery.eq("empleador", empleador);
      countQuery = countQuery.eq("empleador", empleador);
    }

    if (eligibleOnly) {
      dataQuery = dataQuery.eq("is_eligible", true);
      countQuery = countQuery.eq("is_eligible", true);
    }

    const [dataResult, countResult, empleadoresResult] = await Promise.all([
      dataQuery.order("last_movement_at", { ascending: false }).limit(limit),
      countQuery,
      supabase
        .from("backoffice_contract_control_v1")
        .select("empleador")
        .not("empleador", "is", null)
        .order("empleador", { ascending: true })
        .limit(500),
    ]);

    if (dataResult.error) throw dataResult.error;
    if (countResult.error) throw countResult.error;

    const empleadores = Array.from(
      new Set(
        ((empleadoresResult.data ?? []) as Array<{ empleador: string | null }>)
          .map((r) => r.empleador)
          .filter((v): v is string => Boolean(v)),
      ),
    );

    return {
      rows: (dataResult.data ?? []) as EmployeeRow[],
      total: countResult.count ?? 0,
      empleadores,
      setupError: null,
    };
  } catch (error) {
    return {
      rows: [] as EmployeeRow[],
      total: 0,
      empleadores: [] as string[],
      setupError: error instanceof Error ? error.message : "No se pudo leer empleados.",
    };
  }
}

function getSingleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatMoney(value: number | null) {
  if (value === null) return "-";
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatStatus(value: string | null) {
  if (!value) return "pendiente";
  return value.replaceAll("_", " ");
}

function getOfferStatusTone(status: string | null): StatusTone {
  if (!status) return "neutral";
  if (status === "activa" || status === "vigente") return "success";
  if (status === "expirada" || status === "cancelada") return "warning";
  return "neutral";
}

function getOperationalStatusTone(status: string | null): StatusTone {
  if (!status) return "neutral";
  if (status === "error") return "danger";
  if (status === "firmado" || status === "contrato_generado") return "success";
  if (status === "link_expirado" || status === "pendiente_envio") return "warning";
  return "neutral";
}
