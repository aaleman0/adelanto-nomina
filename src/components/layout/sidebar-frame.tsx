"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type NavItem = { href: string; label: string; icon: string };

/* SVG icons para cada sección */
const NavIcon = ({ icon, active }: { icon: string; active: boolean }) => {
  const cls = `h-5 w-5 shrink-0 transition-all duration-200 ${active ? "text-white" : "text-sidebar-text-muted group-hover:text-sidebar-text"}`;

  if (icon === "D")
    return (
      <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    );

  if (icon === "I")
    return (
      <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
      </svg>
    );

  if (icon === "C")
    return (
      <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    );

  if (icon === "S")
    return (
      <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    );

  return <span className={cls + " text-xs font-bold"}>{icon}</span>;
};

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
  const [mobileOpen, setMobileOpen] = useState(false);

  function toggleSidebar() {
    setCollapsed((current) => {
      const next = !current;
      localStorage.setItem("backoffice-sidebar", next ? "compact" : "open");
      return next;
    });
  }

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[auto_1fr]">
      {/* Sidebar desktop */}
      <aside
        className={[
          "sticky top-0 z-20 hidden h-screen flex-col lg:flex",
          "bg-sidebar shadow-[4px_0_24px_rgba(15,23,42,0.18)]",
          "transition-[width] duration-300 ease-in-out",
          collapsed ? "w-[72px]" : "w-[260px]",
        ].join(" ")}
        style={{ background: "linear-gradient(180deg, #0f172a 0%, #1a2744 100%)" }}
      >
        {/* Logo / Brand */}
        <div className={[
          "flex h-[68px] items-center border-b border-white/[0.08]",
          collapsed ? "justify-center px-4" : "gap-3 px-5",
        ].join(" ")}>
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 font-bold text-white text-sm shadow-lg shadow-indigo-900/40">
            BA
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-bold text-white leading-tight">Backoffice Adelantos</p>
              <p className="truncate text-[11px] text-slate-400 leading-tight mt-0.5">Panel Operativo</p>
            </div>
          )}
          {!collapsed && (
            <button
              className="ml-auto grid h-7 w-7 place-items-center rounded-lg text-slate-400 transition-all hover:bg-white/10 hover:text-white"
              onClick={toggleSidebar}
              type="button"
              aria-label="Colapsar sidebar"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              </svg>
            </button>
          )}
        </div>

        {/* Toggle cuando colapsado */}
        {collapsed && (
          <button
            className="mx-auto mt-2 grid h-7 w-7 place-items-center rounded-lg text-slate-400 transition-all hover:bg-white/10 hover:text-white"
            onClick={toggleSidebar}
            type="button"
            aria-label="Expandir sidebar"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
          </button>
        )}

        {/* Nav */}
        <nav className={["flex flex-1 flex-col gap-1 overflow-y-auto py-4", collapsed ? "px-2" : "px-3"].join(" ")}>
          {!collapsed && (
            <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">Menú principal</p>
          )}
          {navigation.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                className={[
                  "group relative flex items-center gap-3 rounded-xl transition-all duration-200",
                  collapsed ? "h-11 w-11 justify-center" : "h-11 px-3",
                  active
                    ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-900/30"
                    : "text-slate-300 hover:bg-white/[0.07] hover:text-white",
                ].join(" ")}
                href={item.href}
                key={item.href}
                title={collapsed ? item.label : undefined}
              >
                {/* Active indicator */}
                {active && (
                  <span className="absolute -left-px top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-white/60" />
                )}
                <NavIcon icon={item.icon} active={active} />
                {!collapsed && (
                  <span className={["text-[13px] font-semibold truncate", active ? "text-white" : ""].join(" ")}>
                    {item.label}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Footer del sidebar */}
        <div className={["border-t border-white/[0.08] py-4", collapsed ? "px-2" : "px-4"].join(" ")}>
          {!collapsed && (
            <p className="text-[11px] text-slate-600 text-center">v0.1 · backoffice</p>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        {/* Top-bar móvil */}
        <div className="sticky top-0 z-10 border-b border-border bg-white/95 backdrop-blur-md lg:hidden shadow-sm">
          <div className="flex h-14 items-center justify-between px-4">
            <div className="flex items-center gap-3">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 font-bold text-white text-xs">
                BA
              </div>
              <p className="font-bold text-text-primary text-sm">Backoffice Adelantos</p>
            </div>
            <button
              aria-label={mobileOpen ? "Cerrar menú" : "Abrir menú"}
              className="grid h-9 w-9 place-items-center rounded-xl border border-border text-text-muted transition hover:bg-surface-muted hover:text-text-primary"
              onClick={() => setMobileOpen((v) => !v)}
              type="button"
            >
              {mobileOpen ? (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
          {mobileOpen && (
            <nav
              className="flex flex-col gap-1 border-t border-white/10 px-3 py-3"
              style={{ background: "linear-gradient(180deg, #0f172a 0%, #1a2744 100%)" }}
            >
              {navigation.map((item) => {
                const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                return (
                  <Link
                    className={[
                      "flex h-11 items-center gap-3 rounded-xl px-3 text-[13px] font-semibold transition-all",
                      active
                        ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg"
                        : "text-slate-300 hover:bg-white/10 hover:text-white",
                    ].join(" ")}
                    href={item.href}
                    key={item.href}
                    onClick={() => setMobileOpen(false)}
                  >
                    <NavIcon icon={item.icon} active={active} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          )}
        </div>

        {children}
      </div>
    </div>
  );
}
