import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getCurrentActor, hasRole } from "@/lib/auth/roles";

/**
 * Guard de servidor para toda la sección de Ajustes.
 *
 * Ocultar el enlace en la barra lateral no basta: la ruta sigue siendo
 * alcanzable escribiendo la URL a mano. Este layout envuelve /settings/** y
 * redirige a quien no sea admin antes de renderizar nada.
 *
 * Es defensa de navegación, no la única barrera: cada endpoint de escritura de
 * esta sección exige `admin` por su cuenta con requireRole(). Aquí solo se
 * evita mostrar formularios que el usuario no podría enviar.
 *
 * Nota sobre el modo de RBAC: esto redirige siempre según el rol, con
 * independencia de RBAC_ENFORCEMENT. El flag gobierna si la API bloquea; la
 * navegación debe reflejar el rol en todo momento para poder verificarlo antes
 * de activar enforce.
 */
export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const actor = await getCurrentActor().catch(() => null);

  if (!actor || !hasRole(actor.role, "admin")) {
    redirect("/");
  }

  return <>{children}</>;
}
