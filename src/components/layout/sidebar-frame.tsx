"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type NavItem = { href: string; label: string; icon: string };

export function SidebarFrame({
  children,
  navigation,
}: {
  children: React.ReactNode;
  navigation: NavItem[];
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(() =>
    typeof window === "undefined"
      ? false
      : localStorage.getItem("backoffice-sidebar") === "compact",
  );

  function toggleSidebar() {
    setCollapsed((current) => {
      const next = !current;
      localStorage.setItem("backoffice-sidebar", next ? "compact" : "open");
      return next;
    });
  }

  return (
    <div className="min-h-screen bg-surface-muted lg:grid lg:grid-cols-[auto_1fr]">
      <aside
        className={[
          "sticky top-0 z-20 hidden h-screen border-r border-border bg-primary-strong text-text-primary shadow-xl transition-[width] duration-200 lg:flex lg:flex-col",
          collapsed ? "w-20" : "w-72",
        ].join(" ")}
      >
        <div className="flex h-16 items-center justify-between border-b border-white/10 px-4">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-base bg-link font-bold text-primary-strong">
              BA
            </div>
            {!collapsed ? (
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-text-primary">Backoffice Adelantos</p>
                <p className="truncate text-xs text-text-secondary">Panel Operativo</p>
              </div>
            ) : null}
          </div>
          <button
            className="grid h-8 w-8 place-items-center rounded-base text-text-primary transition hover:bg-white/10 hover:text-text-primary"
            onClick={toggleSidebar}
            type="button"
            aria-label="Alternar sidebar"
          >
            {collapsed ? "›" : "‹"}
          </button>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {navigation.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                className={[
                  "group flex h-11 items-center gap-3 rounded-base px-3 text-sm font-semibold transition-all",
                  active ? "bg-white text-primary-strong shadow-sm" : "text-text-primary hover:bg-white/10 hover:text-text-primary",
                ].join(" ")}
                href={item.href}
                key={item.href}
                title={item.label}
              >
                <span className={["grid h-7 w-7 shrink-0 place-items-center rounded-base text-xs", active ? "bg-primary text-white" : "bg-white/10"].join(" ")}>{item.icon}</span>
                {!collapsed ? <span className="truncate text-text-primary">{item.label}</span> : null}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-col">
        <div className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border bg-surface/95 px-4 backdrop-blur lg:hidden">
          <p className="font-semibold text-text-primary">Backoffice Adelantos</p>
          <Link className="text-sm font-semibold text-primary" href="/imports">Nueva importación</Link>
        </div>
        {children}
      </div>
    </div>
  );
}
