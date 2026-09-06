import { Screen } from "@/ui/screen";
import { PanelConexion } from "../_ui/panel-conexion";

/**
 * Una pantalla = una tarea: saber si WhatsApp está en pie y, si no, qué falta.
 * La configuración editable vive al final, después del diagnóstico: quien entra
 * aquí casi siempre viene a comprobar, no a cambiar.
 */
export const dynamic = "force-dynamic";

export default function PantallaWhatsApp() {
  return (
    <Screen
      title="Conexión de WhatsApp"
      lead="Si los mensajes no están saliendo, aquí se ve dónde se rompe y qué hay que arreglar."
      back={{ href: "/ajustes", label: "Todos los ajustes" }}
    >
      <PanelConexion />
    </Screen>
  );
}
