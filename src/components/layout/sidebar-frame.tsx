"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export type NavItem = { href: string; label: string; icon: string };
export type NavGroup = { label: string; icon: string; prefix: string; items: NavItem[] };
export type NavEntry = NavItem | NavGroup;

function isGroup(entry: NavEntry): entry is NavGroup {
  return "items" in entry;
}

/* ─── SVG icons ─── */
const NavIcon = ({ icon, active }: { icon: string; active: boolean }) => {
  const cls = `h-5 w-5 shrink-0 transition-all duration-200 ${active ? "text-white" : "text-slate-400 group-hover:text-white"}`;

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
  if (icon === "W")
    return (
      <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
      </svg>
    );
  return <span className={cls + " text-xs font-bold"}>{icon}</span>;
};

/* ─── Single nav link ─── */
function NavLink({
  item,
  collapsed,
  onClick,
}: {
  item: NavItem;
  collapsed: boolean;
  onClick?: () => void;
}) {
  const pathname = usePathname();
  const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

  return (
    <Link
      href={item.href}
      onClick={onClick}
      title={collapsed ? item.label : undefined}
      className={[
        "group relative flex items-center gap-3 rounded-xl transition-all duration-200",
        collapsed ? "h-11 w-11 justify-center" : "h-11 px-3",
        active
          ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-900/30"
          : "text-slate-300 hover:bg-white/[0.07] hover:text-white",
      ].join(" ")}
    >
      {active && (
        <span className="absolute -left-px top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-white/60" />
      )}
      <NavIcon icon={item.icon} active={active} />
      {!collapsed && (
        <span className="text-[13px] font-semibold truncate" style={{ color: '#ffffff' }}>
          {item.label}
        </span>
      )}
    </Link>
  );
}

/* ─── Group with sub-items ─── */
function NavGroupItem({
  group,
  collapsed,
  onClick,
}: {
  group: NavGroup;
  collapsed: boolean;
  onClick?: () => void;
}) {
  const pathname = usePathname();
  const groupActive = group.items.some(item => pathname === item.href || pathname.startsWith(item.href));

  const [open, setOpen] = useState(groupActive);

  if (collapsed) {
    // En sidebar colapsado: solo el icono del grupo, sin sub-items
    return (
      <div
        className={[
          "group relative flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl transition-all duration-200",
          groupActive
            ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-900/30"
            : "text-slate-300 hover:bg-white/[0.07] hover:text-white",
        ].join(" ")}
        title={group.label}
        onClick={() => setOpen((v) => !v)}
      >
        <NavIcon icon={group.icon} active={groupActive} />
      </div>
    );
  }

  return (
    <div>
      {/* Group header button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={[
          "group relative flex w-full items-center gap-3 rounded-xl px-3 h-11 transition-all duration-200",
          groupActive
            ? "text-white bg-white/[0.08]"
            : "text-slate-300 hover:bg-white/[0.07] hover:text-white",
        ].join(" ")}
      >
        {groupActive && (
          <span className="absolute -left-px top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-indigo-400" />
        )}
        <NavIcon icon={group.icon} active={groupActive} />
        <span className="flex-1 truncate text-left text-[13px] font-semibold" style={{ color: '#ffffff' }}>{group.label}</span>
        <svg
          className={[
            "h-3.5 w-3.5 shrink-0 transition-transform duration-200",
            open ? "rotate-180" : "",
          ].join(" ")}
          fill="none"
          viewBox="0 0 24 24"
          stroke="#ffffff"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Sub-items */}
      {open && (
        <div className="mt-0.5 ml-4 flex flex-col gap-0.5 border-l border-white/[0.07] pl-3">
          {group.items.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClick}
                className={[
                  "flex h-9 items-center rounded-lg px-3 text-[12.5px] font-semibold transition-colors",
                  active
                    ? "bg-indigo-600/80 text-white"
                    : "hover:bg-white/[0.06]",
                ].join(" ")}
                style={{ color: '#ffffff' }}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Main SidebarFrame ─── */
export function SidebarFrame({
  children,
  navigation,
}: {
  children: React.ReactNode;
  navigation: NavEntry[];
}) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("backoffice-sidebar") === "compact";
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  function toggleSidebar() {
    setCollapsed((current) => {
      const next = !current;
      if (typeof window !== "undefined") {
        localStorage.setItem("backoffice-sidebar", next ? "compact" : "open");
      }
      return next;
    });
  }

  const renderNavEntries = (closeMobile?: () => void) =>
    navigation.map((entry, i) =>
      isGroup(entry) ? (
        <NavGroupItem key={`g-${i}`} group={entry} collapsed={collapsed} onClick={closeMobile} />
      ) : (
        <NavLink key={entry.href} item={entry} collapsed={collapsed} onClick={closeMobile} />
      ),
    );

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[auto_1fr]">
      {/* ── Desktop sidebar ── */}
      <aside
        className={[
          "sticky top-0 z-20 hidden h-screen flex-col lg:flex",
          "bg-sidebar shadow-[4px_0_24px_rgba(15,23,42,0.18)]",
          "transition-[width] duration-300 ease-in-out",
          collapsed ? "w-[72px]" : "w-[260px]",
        ].join(" ")}
        style={{ background: "linear-gradient(180deg, #0f172a 0%, #1a2744 100%)" }}
      >
        {/* Logo */}
        <div className={[
          "flex h-[68px] items-center border-b border-white/[0.08]",
          collapsed ? "justify-center px-4" : "gap-3 px-5",
        ].join(" ")}>
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 font-bold text-white text-sm shadow-lg shadow-indigo-900/40">
            BA
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-bold leading-tight" style={{ color: '#ffffff' }}>Backoffice Adelantos</p>
              <p className="truncate text-[11px] leading-tight mt-0.5" style={{ color: '#ffffff' }}>Panel Operativo</p>
            </div>
          )}
          {!collapsed && (
            <button
              className="ml-auto grid h-7 w-7 place-items-center rounded-lg transition-all hover:bg-white/10"
              onClick={toggleSidebar}
              type="button"
              aria-label="Colapsar sidebar"
              style={{ color: '#ffffff' }}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="#ffffff" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              </svg>
            </button>
          )}
        </div>

        {collapsed && (
          <button
            className="mx-auto mt-2 grid h-7 w-7 place-items-center rounded-lg transition-all hover:bg-white/10"
            onClick={toggleSidebar}
            type="button"
            aria-label="Expandir sidebar"
            style={{ color: '#ffffff' }}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="#ffffff" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
          </button>
        )}

        {/* Nav */}
        <nav className={["flex flex-1 flex-col gap-1 overflow-y-auto py-4", collapsed ? "px-2" : "px-3"].join(" ")}>
          {!collapsed && (
            <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.15em]" style={{ color: '#ffffff' }}>Menú principal</p>
          )}
          {renderNavEntries()}
        </nav>

        <div className={["border-t border-white/[0.08] py-4", collapsed ? "px-2" : "px-4"].join(" ")}>
          {!collapsed && <p className="text-[11px] text-center" style={{ color: '#ffffff' }}>v0.2 · backoffice</p>}
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        {/* ── Mobile top-bar ── */}
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
              {renderNavEntries(() => setMobileOpen(false))}
            </nav>
          )}
        </div>

        {children}
      </div>
    </div>
  );
}
