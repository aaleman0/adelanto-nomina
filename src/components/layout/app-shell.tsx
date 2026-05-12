import Link from "next/link";
import type { ReactNode } from "react";
import { SidebarFrame } from "./sidebar-frame";

const navigation = [
  { href: "/", label: "Dashboard", icon: "D" },
  { href: "/imports", label: "Importaciones", icon: "I" },
  { href: "/contracts", label: "Control de contratos", icon: "C" },
  { href: "/employees", label: "Empleados / ofertas", icon: "E" },
  { href: "/settings", label: "Configuración", icon: "S" },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <SidebarFrame navigation={navigation}>
      <main className="min-h-screen bg-surface-muted text-text-primary">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>
    </SidebarFrame>
  );
}

export function PageHeader({
  title = "Panel Operativo",
  eyebrow = "Backoffice Adelantos",
  description = "Control interno para importaciones, contratos y seguimiento operativo.",
  action,
}: {
  title?: string;
  eyebrow?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 rounded-base border border-border bg-surface px-5 py-5 shadow-sm md:flex-row md:items-center md:justify-between">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
          {eyebrow}
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-text-primary">
          {title}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-text-muted">{description}</p>
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </header>
  );
}

export function PlaceholderPage({ title }: { title: string }) {
  return (
    <AppShell>
      <PageHeader title={title} description="Módulo reservado para una siguiente fase." />
      <section className="rounded-base border border-dashed border-border bg-surface p-8 text-sm text-text-muted">
        Esta sección queda como placeholder; no se implementan usuarios, permisos ni configuración todavía.
        <div className="mt-4">
          <Link className="font-semibold text-primary hover:text-primary-strong" href="/">
            Volver al dashboard
          </Link>
        </div>
      </section>
    </AppShell>
  );
}
