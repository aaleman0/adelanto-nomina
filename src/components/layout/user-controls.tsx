"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import type { UserRole } from "@/lib/auth/roles-shared";

const ROLE_LABEL: Record<UserRole, string> = {
  admin: "Admin",
  operaciones: "Operación",
  solo_lectura: "Lectura",
};

export function UserControls({ displayName, email, avatarUrl, role, collapsed = false }: { displayName?: string; email: string; avatarUrl?: string; role?: UserRole; collapsed?: boolean }) {
  const [open, setOpen] = useState(false);
  const initials = displayName ? displayName.split(" ").slice(0, 2).map((part) => part[0]).join("").toUpperCase() : email.slice(0, 2).toUpperCase() || "OP";

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return (
    <div className={`min-w-0 ${collapsed ? "" : "flex-1"}`} data-user-controls>
      <button type="button" aria-expanded={open} aria-haspopup="dialog" aria-label="Abrir perfil" onClick={() => setOpen(true)} className={`flex h-10 items-center rounded-lg text-sidebar-text transition hover:bg-white/10 ${collapsed ? "w-10 justify-center" : "w-full gap-2 px-2"}`}>
        <Avatar avatarUrl={avatarUrl} initials={initials} label={displayName ?? email} />
        {collapsed ? null : <><span className="min-w-0 flex-1 truncate text-left text-xs font-semibold">{displayName ?? email ?? "Operador"}</span><svg className="h-3.5 w-3.5 shrink-0 text-sidebar-text-muted" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.17 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" /></svg></>}
      </button>
      {open ? (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-[var(--overlay)] p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
        <div role="dialog" aria-modal="true" aria-labelledby="profile-card-title" className="surface-panel relative w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl animate-fade-up">
          <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar perfil" className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full bg-black/25 text-white transition hover:bg-black/45"><svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m5 5 10 10M15 5 5 15" /></svg></button>
          <div className="relative h-24 bg-[linear-gradient(125deg,var(--color-5),var(--color-3))]">
            <div className="absolute inset-0 opacity-30 [background-image:radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:16px_16px]" />
            <div className="absolute -bottom-9 left-1/2 -translate-x-1/2 rounded-full border-4 border-surface"><Avatar avatarUrl={avatarUrl} initials={initials} label={displayName ?? email} large /></div>
          </div>
          <div className="px-5 pb-4 pt-12 text-center">
            <p id="profile-card-title" className="font-display text-base font-semibold text-text-primary">{displayName ?? "Operador"}</p>
            <p className="mt-0.5 truncate text-xs text-text-muted">{email || "Sesión operativa"}</p>
            <div className="my-4 grid grid-cols-3 divide-x divide-border border-y border-border py-3">
              <ProfileStat value="Activa" label="sesión" /><ProfileStat value={role ? ROLE_LABEL[role] : "—"} label="rol" /><ProfileStat value="Seguro" label="acceso" />
            </div>
            <form action="/auth/logout" method="POST"><button type="submit" className="flex h-9 w-full items-center justify-center rounded-lg bg-[var(--color-5)] text-sm font-semibold text-white transition hover:bg-[var(--color-4)]">Cerrar sesión</button></form>
          </div>
        </div>
        </div>
      ) : null}
    </div>
  );
}

function Avatar({ avatarUrl, initials, label, large = false }: { avatarUrl?: string; initials: string; label: string; large?: boolean }) {
  const size = large ? "h-16 w-16 text-base" : "h-7 w-7 text-[10px]";
  if (avatarUrl) return <Image src={avatarUrl} alt={label} width={64} height={64} unoptimized className={`${size} rounded-full object-cover`} referrerPolicy="no-referrer" />;
  return <span className={`grid ${size} place-items-center rounded-full bg-[var(--color-2)] font-bold text-[var(--color-5)]`}>{initials}</span>;
}

function ProfileStat({ value, label }: { value: string; label: string }) {
  return <div><p className="font-data text-xs font-semibold text-text-primary">{value}</p><p className="mt-0.5 text-[10px] uppercase tracking-wider text-text-muted">{label}</p></div>;
}
