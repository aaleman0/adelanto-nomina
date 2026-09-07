import { Screen } from "@/ui/screen";
import { FormularioAcreedor } from "../_ui/formulario-acreedor";

/**
 * Una pantalla = una tarea: dejar correctos los datos que el contrato imprime.
 * La lectura se hace desde el cliente contra `/api/settings/company` porque ese
 * endpoint es el que define la whitelist de 9 claves que acepta el guardado;
 * leer la tabla completa por otro camino traería claves que el POST rechaza.
 */
export const dynamic = "force-dynamic";

export default function PantallaEmpresa() {
  return (
    <Screen
      title="Datos del acreedor"
      lead="Los datos de tu empresa que se imprimen en cada contrato de adelanto."
      back={{ href: "/ajustes", label: "Todos los ajustes" }}
    >
      <FormularioAcreedor />
    </Screen>
  );
}
