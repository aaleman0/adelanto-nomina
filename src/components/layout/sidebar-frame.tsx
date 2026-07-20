"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { NotificationBell } from "@/components/ui/notifications";
import { UserControls } from "./user-controls";

export type NavItem = { href: string; label: string; icon: string };
export type NavGroup = { label: string; icon: string; prefix: string; items: NavItem[] };
export type NavEntry = NavItem | NavGroup;
const isGroup = (entry: NavEntry): entry is NavGroup => "items" in entry;
const SIDEBAR_STORAGE_KEY = "backoffice-sidebar-collapsed";
const sidebarListeners = new Set<() => void>();

function subscribeToSidebar(callback: () => void) {
  sidebarListeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    sidebarListeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

function getSidebarSnapshot() {
  return localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true";
}

function getSidebarServerSnapshot() {
  return false;
}

function setSidebarCollapsed(collapsed: boolean) {
  localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed));
  sidebarListeners.forEach((listener) => listener());
}

type SidebarUser = { displayName?: string; email: string; avatarUrl?: string };

export function SidebarFrame({ children, navigation, user }: { children: React.ReactNode; navigation: NavEntry[]; user: SidebarUser }) {
  const collapsed = useSyncExternalStore(subscribeToSidebar, getSidebarSnapshot, getSidebarServerSnapshot);
  const [mobileOpen, setMobileOpen] = useState(false);
  const toggle = () => setSidebarCollapsed(!collapsed);
  return (
    <div className="app-viewport flex bg-background">
      <aside className={`hidden h-full shrink-0 flex-col border-r border-[var(--sidebar-border)] bg-sidebar text-sidebar-text transition-[width] duration-300 lg:flex ${collapsed ? "w-[72px]" : "w-[224px]"}`}>
        <div className={`flex h-16 shrink-0 items-center border-b border-[var(--sidebar-border)] ${collapsed ? "justify-center" : "justify-end px-4"}`}>
          <MenuButton open={!collapsed} onClick={toggle} label={collapsed ? "Expandir menú" : "Colapsar menú"} />
        </div>
        <nav className={`panel-scroll flex flex-1 flex-col gap-1 py-4 ${collapsed ? "px-3" : "px-3"}`} aria-label="Navegación principal">
          {navigation.map((entry) => isGroup(entry) ? <Group key={entry.prefix} group={entry} collapsed={collapsed} /> : <Item key={entry.href} item={entry} collapsed={collapsed} />)}
        </nav>
        <div className={`shrink-0 border-t border-[var(--sidebar-border)] p-3 ${collapsed ? "flex justify-center" : ""}`}><SidebarFooter collapsed={collapsed} user={user} /></div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 shrink-0 items-center border-b border-border bg-surface px-4 lg:hidden">
          <MenuButton open={mobileOpen} onClick={() => setMobileOpen((current) => !current)} label={mobileOpen ? "Cerrar menú" : "Abrir menú"} dark />
          <span className="ml-3 font-display text-sm font-semibold text-text-primary">Centro de operación</span>
        </div>
        {mobileOpen ? (
          <nav className="absolute inset-x-0 top-14 z-40 max-h-[calc(100dvh-3.5rem)] overflow-auto border-b border-[var(--sidebar-border)] bg-sidebar p-3 shadow-xl lg:hidden">
            {navigation.map((entry) => isGroup(entry) ? <Group key={entry.prefix} group={entry} collapsed={false} onNavigate={() => setMobileOpen(false)} /> : <Item key={entry.href} item={entry} collapsed={false} onNavigate={() => setMobileOpen(false)} />)}
            <div className="mt-3 border-t border-[var(--sidebar-border)] pt-3"><SidebarFooter collapsed={false} user={user} /></div>
          </nav>
        ) : null}
        {children}
      </div>
    </div>
  );
}

function SidebarFooter({ collapsed, user }: { collapsed: boolean; user: SidebarUser }) {
  return <div className={`flex items-center ${collapsed ? "flex-col gap-2" : "gap-2"}`}><NotificationBell placement="sidebar" /><UserControls collapsed={collapsed} displayName={user.displayName} email={user.email} avatarUrl={user.avatarUrl} /></div>;
}

function Item({ item, collapsed, onNavigate }: { item: NavItem; collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = isItemActive(pathname, item.href);
  return <Link href={item.href} onClick={onNavigate} title={collapsed ? item.label : undefined} className={`group relative flex h-11 items-center rounded-lg transition ${collapsed ? "justify-center" : "gap-3 px-3"} ${active ? "bg-sidebar-active text-sidebar-text-active" : "text-sidebar-text-muted hover:bg-sidebar-hover hover:text-white"}`}><Icon name={item.icon} />{collapsed ? null : <span className="truncate text-[13px] font-semibold">{item.label}</span>}{active ? <span className="absolute -left-3 h-5 w-0.5 bg-[var(--color-2)]" /> : null}</Link>;
}

function isItemActive(pathname: string, href: string) {
  if (["/", "/whatsapp", "/settings", "/settings/whatsapp"].includes(href)) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Group({ group, collapsed, onNavigate }: { group: NavGroup; collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = group.items.some((item) => isItemActive(pathname, item.href));
  const [open, setOpen] = useState(active);
  const expanded = active || open;
  if (collapsed) return <Link href={group.items[0].href} title={group.label} className={`flex h-11 items-center justify-center rounded-lg ${active ? "bg-sidebar-active text-sidebar-text-active" : "text-sidebar-text-muted hover:bg-sidebar-hover hover:text-white"}`}><Icon name={group.icon} /></Link>;
  return <div><button type="button" onClick={() => setOpen((current) => !current)} className={`flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left transition ${active ? "bg-white/10 text-white" : "text-sidebar-text-muted hover:bg-sidebar-hover hover:text-white"}`}><Icon name={group.icon} /><span className="flex-1 text-[13px] font-semibold">{group.label}</span><svg className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" /></svg></button>{expanded ? <div className="ml-5 border-l border-white/10 py-1 pl-3">{group.items.map((item) => <Item key={item.href} item={item} collapsed={false} onNavigate={onNavigate} />)}</div> : null}</div>;
}

function MenuButton({ open, onClick, label, dark = false }: { open: boolean; onClick: () => void; label: string; dark?: boolean }) {
  return <button type="button" onClick={onClick} aria-label={label} aria-expanded={open} className={`relative grid h-10 w-10 place-items-center rounded-lg transition ${dark ? "text-text-primary hover:bg-surface-muted" : "text-sidebar-text-muted hover:bg-white/10 hover:text-white"}`}><span className="relative h-4 w-5"><span className={`absolute left-0 top-0 h-0.5 w-5 rounded bg-current transition-all duration-300 ${open ? "top-[7px] rotate-45" : ""}`} /><span className={`absolute left-0 top-[7px] h-0.5 w-5 rounded bg-current transition-all duration-300 ${open ? "scale-x-0 opacity-0" : ""}`} /><span className={`absolute left-0 top-[14px] h-0.5 w-5 rounded bg-current transition-all duration-300 ${open ? "top-[7px] -rotate-45" : ""}`} /></span></button>;
}

function Icon({ name }: { name: string }) {
  const paths: Record<string, string> = { D: "M4 5h6v6H4V5Zm10 0h6v4h-6V5ZM4 15h6v4H4v-4Zm10-2h6v6h-6v-6Z", I: "M12 3v12m0 0 4-4m-4 4-4-4M5 19h14", C: "M6 3h8l4 4v14H6V3Zm8 0v5h4M9 12h6M9 16h6", W: "M5 18l-1 3 3-1a9 9 0 1 0-2-2Zm4-7h.01M12 11h.01M15 11h.01", S: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm0-12v2m0 13v2m8.5-8.5h-2m-13 0h-2m14.5-6-1.5 1.5m-9 9L6 18m12 0-1.5-1.5m-9-9L6 6" };
  return <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name] ?? paths.D} /></svg>;
}
