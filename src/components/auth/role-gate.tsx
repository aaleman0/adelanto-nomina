"use client";

import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { useHasRole } from "./role-context";
import type { UserRole } from "@/lib/auth/roles-shared";

const ROLE_LABEL: Record<UserRole, string> = {
  admin: "administrador",
  operaciones: "operaciones",
  solo_lectura: "solo lectura",
};

/**
 * Muestra u oculta contenido según el rol del usuario.
 *
 * Dos modos, para los dos casos que aparecen en el backoffice:
 *
 * - `mode="hide"` (por defecto): no renderiza nada si el rol es insuficiente.
 *   Para secciones enteras que no le sirven de nada a ese rol (Ajustes).
 *
 * - `mode="disable"`: renderiza el hijo pero deshabilitado, envuelto en un
 *   tooltip que explica qué rol hace falta. Para botones de acción sueltos: el
 *   usuario ve que la acción existe y entiende que es cuestión de permisos, no
 *   un fallo. El hijo debe ser un único elemento que acepte `disabled`.
 *
 * Recordatorio: esto es UX, no seguridad. El servidor ya bloquea con
 * `requireRole()`.
 */
export function RoleGate({
  minimum,
  mode = "hide",
  children,
  fallback = null,
}: {
  minimum: UserRole;
  mode?: "hide" | "disable";
  children: ReactNode;
  /** Qué mostrar en lugar del contenido cuando se oculta. */
  fallback?: ReactNode;
}) {
  const allowed = useHasRole(minimum);

  if (allowed) return <>{children}</>;

  if (mode === "hide") return <>{fallback}</>;

  // mode="disable": el hijo debe ser un elemento único que acepte `disabled`.
  if (!isValidElement(children)) {
    // Un fragmento o varios hijos no se pueden deshabilitar de forma fiable:
    // se degrada a ocultar en vez de renderizar algo interactivo por error.
    return <>{fallback}</>;
  }

  const reason = `Requiere rol ${ROLE_LABEL[minimum]}.`;
  const element = children as ReactElement<{ disabled?: boolean; title?: string; "aria-disabled"?: boolean }>;

  const disabledChild = cloneElement(element, {
    disabled: true,
    "aria-disabled": true,
    title: reason,
  });

  // El span porta el tooltip: un control deshabilitado no dispara eventos de
  // ratón en algunos navegadores, así que el title del propio botón no basta.
  return (
    <span title={reason} className="inline-flex cursor-not-allowed" data-role-gate="disabled">
      {disabledChild}
    </span>
  );
}
