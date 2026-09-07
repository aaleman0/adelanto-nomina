import type { ReactNode } from "react";
import { Shell } from "@/ui/shell";
import { getCurrentActor } from "@/lib/auth/roles";
import { getUser } from "@/lib/supabase/session";

/**
 * Marco de todo lo que requiere sesión. Las pantallas públicas del empleado
 * (/solicitar, /firmar) y el acceso (/login) viven FUERA de este grupo: no
 * llevan barra lateral ni sesión de backoffice.
 *
 * El gate de sesión lo aplica src/proxy.ts antes de llegar aquí; esta capa solo
 * resuelve identidad y rol para pintar la navegación que corresponde.
 */
export default async function LayoutOperacion({ children }: { children: ReactNode }) {
  const [actor, user] = await Promise.all([
    getCurrentActor().catch(() => null),
    getUser().catch(() => null),
  ]);

  const rol = actor?.role ?? "solo_lectura";
  const nombre =
    (user?.user_metadata?.full_name as string | undefined) ?? user?.email?.split("@")[0] ?? "Operador";

  return (
    <Shell rol={rol} usuario={{ nombre, email: user?.email ?? "" }}>
      {children}
    </Shell>
  );
}
