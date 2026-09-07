import { Screen } from "@/ui/screen";
import { ListaPlantillas } from "../_ui/lista-plantillas";

/**
 * Una pantalla = una tarea: ver qué mensajes están autorizados para salir.
 * No se editan aquí (Meta es la dueña del texto y de la aprobación), así que la
 * pantalla es de lectura con una sola acción: traer el estado real.
 */
export const dynamic = "force-dynamic";

export default function PantallaPlantillas() {
  return (
    <Screen
      title="Plantillas de mensaje"
      lead="Los textos que Meta autorizó para enviar por WhatsApp, y en qué estado quedó cada uno."
      back={{ href: "/ajustes", label: "Todos los ajustes" }}
    >
      <ListaPlantillas />
    </Screen>
  );
}
