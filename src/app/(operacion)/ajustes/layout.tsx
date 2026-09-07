import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentActor, hasRole } from "@/lib/auth/roles";
import { SubNavegacionAjustes } from "./_ui/sub-navegacion";

/**
 * Marco de Ajustes.
 *
 * Aquí no se opera: se cambia lo que afecta a TODA la empresa (lo que se
 * imprime en cada contrato, la conexión por la que salen los mensajes, una
 * corrección masiva de datos). Por eso el gate es duro y NO depende de
 * `RBAC_ENFORCEMENT`: en modo `warn` los endpoints dejan pasar a propósito
 * para poder observar los logs antes de bloquear, pero la pantalla no debe
 * abrirse nunca para quien no es admin.
 *
 * Sin actor (sesión rota o perfil ilegible) también se sale: ante la duda se
 * asume el rol mínimo, nunca el máximo.
 */
export const dynamic = "force-dynamic";

export default async function LayoutAjustes({ children }: { children: ReactNode }) {
  const actor = await getCurrentActor().catch(() => null);

  if (!actor || !hasRole(actor.role, "admin")) {
    redirect("/");
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="border-b border-line bg-surface">
        <div className="mx-auto w-full max-w-[1400px] px-8">
          <SubNavegacionAjustes />
        </div>
      </div>
      {children}
    </div>
  );
}
