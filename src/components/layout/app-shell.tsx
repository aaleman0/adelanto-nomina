import type { ReactNode } from "react";
import { Metric } from "@/components/ui/metric";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-background px-6 py-8 text-text-primary">
      <div className="mx-auto flex max-w-7xl flex-col gap-8">{children}</div>
    </main>
  );
}

export function PageHeader() {
  return (
    <header className="flex flex-col gap-3 border-b border-border pb-6 md:flex-row md:items-end md:justify-between">
      <div>
        <p className="text-sm font-semibold uppercase text-primary">
          Backoffice interno
        </p>
        <h1 className="mt-2 text-h1 font-semibold text-text-primary">
          Adelantos
        </h1>
      </div>
      <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
        <div className="rounded-base border border-border bg-surface px-4 py-3">
          <Metric label="Fase" value="6" />
        </div>
        <div className="rounded-base border border-border bg-surface px-4 py-3">
          <Metric label="BD" value="Lista" />
        </div>
        <div className="rounded-base border border-border bg-surface px-4 py-3">
          <Metric label="RLS" value="V1 abierto" />
        </div>
      </div>
    </header>
  );
}
