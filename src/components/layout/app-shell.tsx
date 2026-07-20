import Link from "next/link";
import type { ReactNode } from "react";
import { SidebarFrame, type NavEntry } from "./sidebar-frame";
import { NotificationsProvider } from "@/components/ui/notifications";
import { getUser } from "@/lib/supabase/session";

const navigation: NavEntry[] = [
  { href: "/", label: "Operación", icon: "D" },
  { href: "/imports", label: "Importar", icon: "I" },
  { href: "/contracts", label: "Contratos", icon: "C" },
  { label: "WhatsApp", icon: "W", prefix: "/whatsapp", items: [
    { href: "/whatsapp", label: "Resumen", icon: "W" },
    { href: "/whatsapp/send", label: "Nuevo envío", icon: "W" },
    { href: "/whatsapp/history", label: "Historial", icon: "W" },
    { href: "/settings/whatsapp/templates", label: "Plantillas", icon: "W" },
    { href: "/settings/whatsapp", label: "Conexión", icon: "W" },
  ] },
  { href: "/settings", label: "Ajustes", icon: "S" },
];

export async function AppShell({ children }: { children: ReactNode }) {
  const user = await getUser().catch(() => null);
  const displayName = user?.user_metadata?.full_name as string | undefined;
  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined;
  return (
    <NotificationsProvider>
      <SidebarFrame
        navigation={navigation}
        user={{ displayName, email: user?.email ?? "", avatarUrl }}
      >
        <main className="flex min-h-0 flex-1 flex-col bg-transparent text-text-primary">
          <div className="panel-scroll flex min-h-0 w-full flex-1 flex-col gap-5 px-4 py-4 sm:px-6 lg:px-7">{children}</div>
        </main>
      </SidebarFrame>
    </NotificationsProvider>
  );
}

export function PageHeader({ title = "Panel operativo", action }: { title?: string; action?: ReactNode }) {
  return <header className="flex shrink-0 flex-col gap-3 md:flex-row md:items-center md:justify-between"><h1 className="font-display text-2xl font-semibold tracking-[-0.03em] text-text-primary">{title}</h1>{action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}</header>;
}

export function PlaceholderPage({ title }: { title: string }) {
  return <AppShell><PageHeader title={title} /><section className="surface-panel rounded-xl border-dashed py-12 text-center"><p className="text-text-muted">Módulo en desarrollo.</p><div className="mt-4"><Link className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary-hover" href="/">Volver a operación</Link></div></section></AppShell>;
}
