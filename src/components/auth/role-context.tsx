"use client";

import { createContext, useContext } from "react";
import { hasRole, type UserRole } from "@/lib/auth/roles-shared";

/**
 * Rol del usuario, disponible en componentes de cliente.
 *
 * El valor lo siembra el shell (server component) con el rol resuelto en el
 * servidor, así que no hay ninguna llamada extra desde el navegador ni
 * parpadeo. Es el mismo patrón que `NotificationsProvider`.
 *
 * IMPORTANTE: esto es solo experiencia de usuario. La autorización real la
 * aplica `requireRole()` en el servidor. Si este contexto tuviera un hueco, el
 * 403 del backend sigue detrás. No lo trates como una barrera de seguridad.
 */

const RoleContext = createContext<UserRole | null>(null);

export function RoleProvider({
  role,
  children,
}: {
  role: UserRole;
  children: React.ReactNode;
}) {
  return <RoleContext.Provider value={role}>{children}</RoleContext.Provider>;
}

/**
 * Rol actual. Devuelve `solo_lectura` si se usa fuera del provider: el mínimo,
 * nunca el máximo, para que un error de montaje no abra permisos por accidente.
 */
export function useRole(): UserRole {
  return useContext(RoleContext) ?? "solo_lectura";
}

/** `true` si el usuario alcanza el rol mínimo. Útil para lógica a medida. */
export function useHasRole(minimum: UserRole): boolean {
  return hasRole(useRole(), minimum);
}
