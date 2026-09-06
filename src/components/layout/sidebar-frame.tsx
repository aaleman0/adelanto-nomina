"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type CSSProperties } from "react";
import { NotificationBell } from "@/components/ui/notifications";
import { UserControls } from "./user-controls";

import type { UserRole } from "@/lib/auth/roles-shared";

export type NavItem = { href: string; label: string; icon: string; minimumRole?: UserRole };
export type NavGroup = { label: string; icon: string; prefix: string; items: NavItem[]; minimumRole?: UserRole };
// Encabezado que agrupa la navegación por etapa del flujo (no es un destino).
export type NavSection = { section: string; minimumRole?: UserRole };
export type NavEntry = NavItem | NavGroup | NavSection;
const isGroup = (entry: NavEntry): entry is NavGroup => "items" in entry;
const isSection = (entry: NavEntry): entry is NavSection => "section" in entry;

type SidebarUser = { displayName?: string; email: string; avatarUrl?: string; role?: UserRole };

function isItemActive(pathname: string, href: string) {
  if (["/", "/whatsapp", "/settings", "/settings/whatsapp"].includes(href)) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

const nn = (n: number) => String(n).padStart(2, "0");
const staggerVar = (i: number) => ({ "--i": i } as CSSProperties);

/**
 * Shell editorial: barra superior mínima (marca · Menú) + menú a pantalla
 * completa (tipo Grafik) con entrada escalonada y salida animada. Conserva el
 * nombre y la firma para no tocar el resto del app.
 */
export function SidebarFrame({ children, navigation, user }: { children: React.ReactNode; navigation: NavEntry[]; user: SidebarUser }) {
  const pathname = usePathname();
  // `mounted` mantiene el overlay en el DOM durante la animación de salida; el
  // propio overlay pide su desmontaje vía onExited al terminar el fade.
  const [mounted, setMounted] = useState(false);

  return (
    <div className="app-viewport flex flex-col bg-background text-text-primary">
      <header className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4 sm:px-8 lg:px-14">
        <Link href="/" className="font-display text-[15px] font-bold uppercase tracking-[0.06em] text-text-primary">
          Adelanto Nómina<sup className="text-[0.6em] font-semibold">®</sup>
        </Link>
        <div className="flex items-center gap-4">
          <NotificationBell placement="sidebar" />
          <button
            type="button"
            onClick={() => setMounted(true)}
            aria-haspopup="dialog"
            aria-expanded={mounted}
            className="inline-flex items-center gap-2 text-[14px] font-semibold uppercase tracking-[0.14em] text-text-primary hover:text-primary"
          >
            <span className="inline-block h-2.5 w-2.5 bg-current" aria-hidden="true" />
            Menú
          </button>
        </div>
      </header>

      {children}

      {mounted ? (
        <MenuOverlay navigation={navigation} user={user} pathname={pathname} onExited={() => setMounted(false)} />
      ) : null}
    </div>
  );
}

function MenuOverlay({
  navigation,
  user,
  pathname,
  onExited,
}: {
  navigation: NavEntry[];
  user: SidebarUser;
  pathname: string;
  onExited: () => void;
}) {
  const [visible, setVisible] = useState(false);

  // Enter: pintar una vez en opacidad 0 y luego activar la transición (doble
  // rAF). Esc cierra. Se bloquea el scroll del fondo mientras el menú vive.
  useEffect(() => {
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setVisible(true));
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setVisible(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  const requestClose = () => setVisible(false);

  // Precalcula las filas con su índice de escalonado (i) y el número de destino.
  const rows: Array<
    | { kind: "section"; key: string; label: string; i: number }
    | { kind: "group"; key: string; group: NavGroup; no: number; i: number }
    | { kind: "item"; key: string; item: NavItem; no: number; i: number }
  > = [];
  let stagger = 1;
  let dest = 0;
  for (const entry of navigation) {
    const i = stagger++;
    if (isSection(entry)) rows.push({ kind: "section", key: `s-${entry.section}`, label: entry.section, i });
    else if (isGroup(entry)) rows.push({ kind: "group", key: entry.prefix, group: entry, no: ++dest, i });
    else rows.push({ kind: "item", key: entry.href, item: entry, no: ++dest, i });
  }
  const footerI = stagger;

  return (
    <div
      className="menu-overlay fixed inset-0 z-50 flex flex-col bg-background text-text-primary"
      data-visible={visible ? "true" : "false"}
      role="dialog"
      aria-modal="true"
      aria-label="Menú"
      onTransitionEnd={(e) => {
        if (e.propertyName === "opacity" && e.target === e.currentTarget && !visible) onExited();
      }}
    >
      <header className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4 sm:px-8 lg:px-14">
        <span className="font-display text-[15px] font-bold uppercase tracking-[0.06em]">
          Adelanto Nómina<sup className="text-[0.6em] font-semibold">®</sup>
        </span>
        <button
          type="button"
          onClick={requestClose}
          className="inline-flex items-center gap-2 text-[14px] font-semibold uppercase tracking-[0.14em] transition-colors hover:text-primary"
        >
          <span aria-hidden="true" className="text-lg leading-none">✕</span>
          Cerrar
        </button>
      </header>

      <div className="panel-scroll min-h-0 flex-1">
        <div className="flex min-h-full flex-col justify-center px-5 py-8 sm:px-8 lg:px-14">
          <nav aria-label="Secciones" className="w-full max-w-4xl">
            {rows.map((row) =>
              row.kind === "section" ? (
                <div key={row.key} className="menu-stagger mt-8 mb-1 flex items-center gap-4 first:mt-0" style={staggerVar(row.i)}>
                  <span className="whitespace-nowrap text-[11px] uppercase tracking-[0.18em] text-text-muted">{row.label}</span>
                  <span className="h-px flex-1 bg-border" />
                </div>
              ) : row.kind === "group" ? (
                <MenuGroupRow key={row.key} group={row.group} no={row.no} i={row.i} pathname={pathname} onNavigate={requestClose} />
              ) : (
                <MenuItemRow
                  key={row.key}
                  item={row.item}
                  no={row.no}
                  i={row.i}
                  active={isItemActive(pathname, row.item.href)}
                  onNavigate={requestClose}
                />
              ),
            )}
          </nav>
        </div>
      </div>

      <footer className="menu-stagger flex shrink-0 items-center justify-between gap-4 border-t border-border px-5 py-4 sm:px-8 lg:px-14" style={staggerVar(footerI)}>
        <UserControls collapsed={false} displayName={user.displayName} email={user.email} avatarUrl={user.avatarUrl} role={user.role} />
        <span className="hidden shrink-0 text-xs text-text-muted sm:inline">
          <kbd className="border border-border-strong px-1.5 py-0.5 font-sans text-[11px] not-italic text-text-primary">Esc</kbd>
          <span className="ml-2">para cerrar</span>
        </span>
      </footer>
    </div>
  );
}

function MenuItemRow({ item, no, i, active, onNavigate }: { item: NavItem; no: number; i: number; active: boolean; onNavigate: () => void }) {
  return (
    <div className="menu-stagger" style={staggerVar(i)}>
      <Link href={item.href} onClick={onNavigate} className="menu-navitem group flex items-baseline gap-5 py-2">
        <span className={["min-w-[2.6ch] pt-[0.4em] text-[13px] font-medium tabular-nums", active ? "text-primary" : "text-text-disabled group-hover:text-primary"].join(" ")}>
          {nn(no)}
        </span>
        <span
          className={[
            "font-display text-[clamp(2rem,4.6vw,3.15rem)] font-bold leading-[1.04] tracking-[-0.02em]",
            active ? "text-primary" : "text-text-primary group-hover:text-primary",
          ].join(" ")}
        >
          {item.label}
        </span>
        {active ? (
          <span className="inline-flex items-center gap-2 self-center whitespace-nowrap pl-1 text-[11px] uppercase tracking-[0.12em] text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
            en pantalla
          </span>
        ) : (
          <span className="menu-arrow self-center font-display text-2xl text-primary" aria-hidden="true">→</span>
        )}
      </Link>
    </div>
  );
}

function MenuGroupRow({ group, no, i, pathname, onNavigate }: { group: NavGroup; no: number; i: number; pathname: string; onNavigate: () => void }) {
  const active = group.items.some((it) => isItemActive(pathname, it.href));
  return (
    <div className="menu-stagger" style={staggerVar(i)}>
      <div className="flex items-baseline gap-5 py-2">
        <span className={["min-w-[2.6ch] pt-[0.4em] text-[13px] font-medium tabular-nums", active ? "text-primary" : "text-text-disabled"].join(" ")}>{nn(no)}</span>
        <span className={["font-display text-[clamp(2rem,4.6vw,3.15rem)] font-bold leading-[1.04] tracking-[-0.02em]", active ? "text-primary" : "text-text-primary"].join(" ")}>
          {group.label}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-6 gap-y-1 pl-[calc(2.6ch+1.25rem)]">
        {group.items.map((sub) => {
          const subActive = isItemActive(pathname, sub.href);
          return (
            <Link
              key={sub.href}
              href={sub.href}
              onClick={onNavigate}
              className={["py-1 text-[15px] transition-colors hover:text-primary", subActive ? "font-semibold text-text-primary" : "text-text-muted"].join(" ")}
            >
              {sub.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
