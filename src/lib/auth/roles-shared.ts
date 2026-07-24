/**
 * Piezas de roles seguras para el cliente.
 *
 * Este módulo NO importa nada de servidor (next/headers, supabase, logger), así
 * que puede entrar en el bundle del navegador. `roles.ts` lo reexporta para el
 * código de servidor; los componentes de cliente importan de aquí.
 *
 * Los roles son acumulativos:
 *
 *   solo_lectura  <  operaciones  <  admin
 *
 * - `solo_lectura` consulta evidencia.
 * - `operaciones`  además importa CSV, envía mensajes y opera contratos.
 * - `admin`        además cambia configuración y credenciales.
 */

export type UserRole = "admin" | "operaciones" | "solo_lectura";

const ROLE_RANK: Record<UserRole, number> = {
  solo_lectura: 0,
  operaciones: 1,
  admin: 2,
};

export function hasRole(actual: UserRole, minimum: UserRole): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[minimum];
}

export function isValidRole(value: unknown): value is UserRole {
  return value === "admin" || value === "operaciones" || value === "solo_lectura";
}
