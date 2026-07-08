import Link from "next/link";
import type { ReactNode } from "react";
import { SidebarFrame } from "./sidebar-frame";
import type { NavEntry } from "./sidebar-frame";
import { NotificationsProvider, NotificationBell } from "@/components/ui/notifications";
import { getUser } from "@/lib/supabase/session";

const navigation: NavEntry[] = [
  { href: "/", label: "Dashboard", icon: "D" },
  { href: "/imports", label: "Importaciones", icon: "I" },
  { href: "/contracts", label: "Control de contratos", icon: "C" },
  {
    label: "WhatsApp",
    icon: "W",
    prefix: "/whatsapp",
    items: [
      { href: "/whatsapp", label: "Dashboard", icon: "W" },
      { href: "/whatsapp/send", label: "Enviar mensajes", icon: "W" },
      { href: "/whatsapp/history", label: "Historial de envíos", icon: "W" },
      { href: "/settings/whatsapp/templates", label: "Templates", icon: "W" },
      { href: "/settings/whatsapp", label: "Configuración", icon: "W" },
    ],
  },
  { href: "/settings", label: "Configuración", icon: "S" },
];

export async function AppShell({ children }: { children: ReactNode }) {
  // getUser() puede fallar si SUPABASE_ANON_KEY no está configurada aún.
  const user = await getUser().catch(() => null);
  const displayName = user?.user_metadata?.full_name as string | undefined;
  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined;
  const email = user?.email ?? "";

  return (
    <NotificationsProvider>
      <SidebarFrame navigation={navigation}>
        <main className="min-h-screen bg-background text-text-primary">
          {/* Topbar: notificaciones + usuario */}
          <div className="mx-auto flex w-full max-w-7xl items-center justify-end gap-3 px-4 py-3 sm:px-6 lg:px-8">
            <NotificationBell />
            <UserMenu displayName={displayName} email={email} avatarUrl={avatarUrl} />
          </div>
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 pb-6 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>
      </SidebarFrame>
    </NotificationsProvider>
  );
}

function UserMenu({
  displayName,
  email,
  avatarUrl,
}: {
  displayName?: string;
  email: string;
  avatarUrl?: string;
}) {
  const initials = displayName
    ? displayName.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase()
    : email.slice(0, 2).toUpperCase();

  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm shadow-sm">
      {/* Avatar */}
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt={displayName ?? email}
          className="h-7 w-7 rounded-full object-cover ring-1 ring-[var(--border)]"
          referrerPolicy="no-referrer"
        />
      ) : (
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 text-[11px] font-bold text-white">
          {initials}
        </span>
      )}

      {/* Nombre / email */}
      <span className="hidden font-medium text-[var(--text-primary)] sm:block max-w-[140px] truncate">
        {displayName ?? email}
      </span>

      {/* Separador */}
      <span className="hidden h-4 w-px bg-[var(--border)] sm:block" />

      {/* Botón salir */}
      <form action="/auth/logout" method="POST">
        <button
          type="submit"
          className="flex items-center gap-1 text-xs text-[var(--text-muted)] transition hover:text-[var(--danger)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] rounded"
          title="Cerrar sesión"
        >
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          <span className="hidden sm:inline">Salir</span>
        </button>
      </form>
    </div>
  );
}

export function PageHeader({
  title = "Panel Operativo",
  action,
}: {
  title?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <h1 className="text-xl font-semibold tracking-tight text-text-primary">
        {title}
      </h1>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </header>
  );
}

export function PlaceholderPage({ title }: { title: string }) {
  return (
    <AppShell>
      <PageHeader title={title} />
      <section className="rounded-xl border border-dashed border-border bg-surface py-12 text-center">
        <p className="text-text-muted">Módulo en desarrollo.</p>
        <div className="mt-4">
          <Link
            className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-white transition hover:bg-primary-hover"
            href="/"
          >
            Volver al dashboard
          </Link>
        </div>
      </section>
    </AppShell>
  );
}
