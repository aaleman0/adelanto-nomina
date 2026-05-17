import Link from "next/link";
import type { ReactNode } from "react";
import { SidebarFrame } from "./sidebar-frame";

const navigation = [
  { href: "/", label: "Dashboard", icon: "D" },
  { href: "/imports", label: "Importaciones", icon: "I" },
  { href: "/contracts", label: "Control de contratos", icon: "C" },
  { href: "/settings", label: "Configuración", icon: "S" },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <SidebarFrame navigation={navigation}>
      <main className="min-h-screen bg-background text-text-primary">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
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
    <header className="relative overflow-hidden flex flex-col gap-4 rounded-2xl border border-primary-border bg-white px-6 py-6 shadow-sm md:flex-row md:items-center md:justify-between">
      {/* Decorative gradient blob */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full opacity-[0.06]"
        style={{ background: "radial-gradient(circle, #4f46e5 0%, transparent 70%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-6 left-1/3 h-32 w-32 rounded-full opacity-[0.04]"
        style={{ background: "radial-gradient(circle, #06b6d4 0%, transparent 70%)" }}
      />
      <div className="relative">
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-primary-light px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-primary">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          {eyebrow}
        </span>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-text-primary">
          {title}
        </h1>
        <p className="mt-1.5 max-w-2xl text-[13px] text-text-muted">{description}</p>
      </div>
      {action ? <div className="relative flex shrink-0 items-center gap-2">{action}</div> : null}
    </header>
  );
}

export function PlaceholderPage({ title }: { title: string }) {
  return (
    <AppShell>
      <PageHeader title={title} description="Módulo reservado para una siguiente fase." />
      <section className="rounded-2xl border border-dashed border-primary-border bg-surface p-10 text-sm text-text-muted text-center">
        <div className="mx-auto max-w-sm">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-primary-light">
            <svg className="h-7 w-7 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <p className="font-semibold text-text-primary">Próximamente</p>
          <p className="mt-1 text-text-muted">Esta sección queda como placeholder; no se implementan usuarios, permisos ni configuración todavía.</p>
          <div className="mt-5">
            <Link className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-white shadow-sm shadow-primary/25 transition hover:bg-primary-hover" href="/">
              Volver al dashboard
            </Link>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
