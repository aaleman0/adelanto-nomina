import { describe, it, expect } from "vitest";
import { nombreDeArchivo } from "./[cycleId]/export/route";

/**
 * El archivo hereda el nombre del que se importó: con varios ciclos descargados
 * en la misma carpeta, "firmados-4c68533b.xlsx" no le dice nada al operador,
 * pero "AdelantoNominaConexion_V2 - Empleados - firmados.xlsx" sí.
 */
describe("nombreDeArchivo", () => {
  it("hereda el nombre del import y le añade 'firmados'", () => {
    expect(nombreDeArchivo("AdelantoNominaConexion_V2 - Empleados.csv", "abc12345")).toBe(
      "AdelantoNominaConexion_V2 - Empleados - firmados.xlsx",
    );
  });

  it("quita la extensión original, sea cual sea", () => {
    expect(nombreDeArchivo("nomina.xlsx", "abc")).toBe("nomina - firmados.xlsx");
    expect(nombreDeArchivo("nomina.CSV", "abc")).toBe("nomina - firmados.xlsx");
  });

  it("cae a un nombre con el id cuando el ciclo no tiene archivo", () => {
    expect(nombreDeArchivo(null, "4c68533b-505d")).toBe("firmados-4c68533b.xlsx");
    expect(nombreDeArchivo("", "4c68533b-505d")).toBe("firmados-4c68533b.xlsx");
  });

  it("limpia lo que rompería la cabecera HTTP (comillas, saltos de línea)", () => {
    const r = nombreDeArchivo('raro"con\\comillas\ny salto.csv', "abc");
    expect(r).not.toMatch(/["\\\r\n]/);
    expect(r).toMatch(/ - firmados\.xlsx$/);
  });
});
