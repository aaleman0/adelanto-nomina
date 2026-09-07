import { getCurrentActor } from "@/lib/auth/roles";
import { EnviarOfertas } from "./_ui/enviar-ofertas";

/** Los pasos consultan lotes, plantillas y elegibilidad en vivo: nada que cachear. */
export const dynamic = "force-dynamic";

/**
 * ENVIAR OFERTAS.
 *
 * El servidor solo resuelve una cosa: el rol. Con él, la pantalla puede
 * deshabilitar el envío y DECIR POR QUÉ, en vez de dejar que el operador
 * complete los cuatro pasos para estrellarse contra un 403 al final.
 *
 * El rol también se verifica dentro del endpoint (`/api/whatsapp/bulk` exige
 * `operaciones`): esto de aquí es comodidad de la interfaz, no el candado.
 */
export default async function PaginaEnviarOfertas() {
  const actor = await getCurrentActor().catch(() => null);

  return <EnviarOfertas rol={actor?.role ?? "solo_lectura"} />;
}
