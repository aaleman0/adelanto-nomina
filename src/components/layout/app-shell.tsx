import Link from "next/link";
import type { ReactNode } from "react";
import { SidebarFrame, type NavEntry } from "./sidebar-frame";
import { HealthBanner } from "./health-banner";
import { NotificationsProvider } from "@/components/ui/notifications";
import { RoleProvider } from "@/components/auth/role-context";
import { getCurrentActor, hasRole, type UserRole } from "@/lib/auth/roles";
import { getUser } from "@/lib/supabase/session";

// Navegación organizada por el flujo del empleado, no por herramientas: entra
// (Importar), se le contacta (WhatsApp), avanza (Operación) y queda en el
// archivo (Contratos). Las secciones reflejan ese recorrido.
const navigation: NavEntry[] = [
  { section: "Flujo" },
  { href: "/", label: "Operación", icon: "D" },
  { href: "/imports", label: "Importar", icon: "I" },
  { href: "/contracts", label: "Contratos", icon: "C" },
  { section: "Mensajería" },
  { label: "WhatsApp", icon: "W", prefix: "/whatsapp", items: [
    { href: "/whatsapp", label: "Resumen", icon: "W" },
    { href: "/whatsapp/send", label: "Nuevo envío", icon: "W" },
    { href: "/whatsapp/history", label: "Historial", icon: "W" },
    // Plantillas y Conexión viven bajo /settings, que es admin-only: se
    // filtran para no dejar enlaces que redirigen a la portada.
    { href: "/settings/whatsapp/templates", label: "Plantillas", icon: "W", minimumRole: "admin" },
    { href: "/settings/whatsapp", label: "Conexión", icon: "W", minimumRole: "admin" },
  ] },
  // La sección y su único ítem son admin: sin ese rol, ambos desaparecen y no
  // queda un encabezado colgando.
  { section: "Configuración", minimumRole: "admin" },
  { href: "/settings", label: "Ajustes", icon: "S", minimumRole: "admin" },
];

export async function AppShell({ children }: { children: ReactNode }) {
  // El actor aporta el rol; getUser aporta los metadatos de perfil (nombre y
  // avatar) que el actor no incluye.
  const [actor, user] = await Promise.all([
    getCurrentActor().catch(() => null),
    getUser().catch(() => null),
  ]);
  const role = actor?.role ?? "solo_lectura";
  const displayName = user?.user_metadata?.full_name as string | undefined;
  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined;

  // La barra lateral se filtra en el servidor: los enlaces admin-only no llegan
  // al cliente si el rol no alcanza, así que no hay nada que ocultar por CSS.
  // Se filtra en dos niveles (entradas de primer nivel y sub-ítems de grupo) y
  // se descarta un grupo que se queda sin ítems visibles.
  const allows = (minimumRole?: UserRole) => !minimumRole || hasRole(role, minimumRole);
  const visibleNavigation = navigation
    .filter((entry) => allows(entry.minimumRole))
    .map((entry) =>
      "items" in entry
        ? { ...entry, items: entry.items.filter((item) => allows(item.minimumRole)) }
        : entry,
    )
    .filter((entry) => !("items" in entry) || entry.items.length > 0);

  return (
    <RoleProvider role={role}>
      <NotificationsProvider>
        <SidebarFrame
          navigation={visibleNavigation}
          user={{ displayName, email: user?.email ?? "", avatarUrl, role }}
        >
          <main className="flex min-h-0 flex-1 flex-col bg-transparent text-text-primary">
            <div className="panel-scroll flex min-h-0 w-full flex-1 flex-col gap-5 px-4 py-4 sm:px-6 lg:px-7">
              <HealthBanner />
              {children}
            </div>
          </main>
        </SidebarFrame>
      </NotificationsProvider>
    </RoleProvider>
  );
}

export function PageHeader({ title = "Panel operativo", action }: { title?: string; action?: ReactNode }) {
  return <header className="flex shrink-0 flex-col gap-3 md:flex-row md:items-center md:justify-between"><h1 className="font-display text-2xl font-semibold tracking-[-0.03em] text-text-primary">{title}</h1>{action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}</header>;
}

export function PlaceholderPage({ title }: { title: string }) {
  return <AppShell><PageHeader title={title} /><section className="surface-panel rounded-xl border-dashed py-12 text-center"><p className="text-text-muted">Módulo en desarrollo.</p><div className="mt-4"><Link className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary-hover" href="/">Volver a operación</Link></div></section></AppShell>;
}
