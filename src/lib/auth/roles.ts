import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/session";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

/**
 * Control de acceso basado en roles.
 *
 * Hasta ahora el único control era binario: había sesión o no. `profiles.role`
 * existía en el esquema pero no se consultaba en ninguna decisión.
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

export type Actor = {
  userId: string;
  email: string | null;
  role: UserRole;
};

/**
 * Modo de aplicación.
 *
 * `warn` (por defecto) registra la violación pero **deja pasar**. Permite
 * desplegar, comprobar en los logs que los roles asignados son los correctos y
 * solo entonces pasar a `enforce`. Es el mismo despliegue por fases que se usó
 * con la CSP, y evita quedarse fuera de la propia aplicación: todos los
 * perfiles nacen como `solo_lectura`, así que activar `enforce` sin haber
 * promovido a nadie bloquearía cualquier escritura.
 */
export type RbacMode = "enforce" | "warn";

export function getRbacMode(): RbacMode {
  return process.env.RBAC_ENFORCEMENT === "enforce" ? "enforce" : "warn";
}

function bootstrapAdminEmails(): string[] {
  return (process.env.BOOTSTRAP_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function isValidRole(value: unknown): value is UserRole {
  return value === "admin" || value === "operaciones" || value === "solo_lectura";
}

/**
 * Resuelve el actor de la petición actual.
 *
 * Devuelve `null` si no hay sesión. Si el correo figura en
 * `BOOTSTRAP_ADMIN_EMAILS` y su rol almacenado no es `admin`, lo promueve y lo
 * deja registrado: así se puede designar al primer administrador por
 * configuración, sin tener que tocar la base a mano.
 */
export async function getCurrentActor(): Promise<Actor | null> {
  const user = await getUser().catch(() => null);
  if (!user) return null;

  const supabase = getSupabaseAdmin();
  const email = user.email ?? null;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, email, role")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    logger.error("auth.profile_lookup_failed", error, { userId: user.id });
    // Sin poder confirmar el rol se asume el mínimo, nunca el máximo.
    return { userId: user.id, email, role: "solo_lectura" };
  }

  const storedRole = isValidRole(profile?.role) ? profile.role : "solo_lectura";
  const shouldBootstrap =
    email !== null &&
    bootstrapAdminEmails().includes(email.toLowerCase()) &&
    storedRole !== "admin";

  if (shouldBootstrap) {
    const { error: upsertError } = await supabase
      .from("profiles")
      .upsert({ id: user.id, email, role: "admin" }, { onConflict: "id" });

    if (upsertError) {
      logger.error("auth.bootstrap_admin_failed", upsertError, { userId: user.id });
    } else {
      logger.warn("auth.bootstrap_admin_applied", {
        userId: user.id,
        email,
        detail: "Promovido a admin por BOOTSTRAP_ADMIN_EMAILS.",
      });
      return { userId: user.id, email, role: "admin" };
    }
  }

  return { userId: user.id, email, role: storedRole };
}

export function hasRole(actual: UserRole, minimum: UserRole): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[minimum];
}

export type RequireRoleResult =
  | { ok: true; actor: Actor }
  | { ok: false; response: NextResponse };

/**
 * Exige un rol mínimo en un route handler.
 *
 *   const auth = await requireRole("operaciones");
 *   if (!auth.ok) return auth.response;
 *   // auth.actor.userId disponible para auditoría
 *
 * Sin sesión devuelve 401. Con sesión pero rol insuficiente devuelve 403 en
 * modo `enforce`; en modo `warn` deja pasar y lo registra.
 */
export async function requireRole(minimum: UserRole): Promise<RequireRoleResult> {
  const actor = await getCurrentActor();

  if (!actor) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "Se requiere iniciar sesión." },
        { status: 401 },
      ),
    };
  }

  if (hasRole(actor.role, minimum)) {
    return { ok: true, actor };
  }

  const mode = getRbacMode();

  logger.warn("auth.insufficient_role", {
    userId: actor.userId,
    email: actor.email,
    role: actor.role,
    required: minimum,
    mode,
    blocked: mode === "enforce",
  });

  if (mode === "warn") {
    return { ok: true, actor };
  }

  return {
    ok: false,
    response: NextResponse.json(
      {
        ok: false,
        error: `Esta acción requiere el rol "${minimum}". Tu rol actual es "${actor.role}".`,
      },
      { status: 403 },
    ),
  };
}
