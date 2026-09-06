import { Screen } from "@/ui/screen";
import { AuditoriaTelefonos } from "../_ui/auditoria-telefonos";

/**
 * Una pantalla = una tarea: dejar los teléfonos en el formato que WhatsApp
 * acepta. La revisión lee la tabla completa de empleados, así que corre en el
 * cliente con estado de carga real en vez de bloquear el render del servidor.
 */
export const dynamic = "force-dynamic";

export default function PantallaTelefonos() {
  return (
    <Screen
      title="Teléfonos mal capturados"
      lead="Un número mal escrito es un empleado que nunca recibe su oferta. Aquí se revisan todos y se corrigen los que se pueden."
      back={{ href: "/ajustes", label: "Todos los ajustes" }}
    >
      <AuditoriaTelefonos />
    </Screen>
  );
}
