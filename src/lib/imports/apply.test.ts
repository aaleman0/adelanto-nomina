import { describe, it, expect } from "vitest";
import {
  buildOfferPayload,
  hasEmployeeChanged,
  requireString,
  type Employee,
  type EmployeePayload,
  type NormalizedPayload,
  type RawImportRow,
} from "./apply";

/**
 * Estas funciones son la lógica pura de `applyImportBatch`. El resto del módulo
 * está acoplado a Supabase y se cubre por E2E; aquí se aísla lo que decide
 * conteos y estados, que es donde un error pasa desapercibido.
 */

const EMPLOYEE: Employee = {
  id: "emp-1",
  rfc: "PELJ900101AB1",
  curp: "PELJ900101MDFRPN08",
  nombre: "Juana",
  apellido_paterno: "Pérez",
  apellido_materno: "López",
  apellidos: "Pérez López",
  cp_csf: "01000",
  telefono: "8180188991",
  telefono_normalizado: "5218180188991",
  email: "juana@example.com",
  empleador: "ACME SA",
  estado_civil: "Soltera",
  nacionalidad: "Mexicana",
  lugar_origen: "CDMX",
  fecha_nacimiento: "1990-01-01",
  domicilio: "Calle Falsa 123",
};

/** Un payload idéntico al empleado de referencia (mismos valores). */
function payloadFrom(employee: Employee): EmployeePayload {
  const { id: _id, ...rest } = employee;
  return { ...rest, source_batch_id: "batch-1", source_row_id: "row-1" };
}

describe("hasEmployeeChanged", () => {
  it("no detecta cambio cuando todos los campos coinciden", () => {
    expect(hasEmployeeChanged(EMPLOYEE, payloadFrom(EMPLOYEE))).toBe(false);
  });

  it("detecta cambio en cualquier campo relevante", () => {
    const fields: Array<keyof EmployeePayload> = [
      "curp", "nombre", "apellido_paterno", "apellido_materno", "apellidos",
      "cp_csf", "telefono", "telefono_normalizado", "email", "empleador",
      "estado_civil", "nacionalidad", "lugar_origen", "fecha_nacimiento", "domicilio",
    ];
    for (const field of fields) {
      const next = { ...payloadFrom(EMPLOYEE), [field]: "VALOR-DISTINTO" };
      expect(hasEmployeeChanged(EMPLOYEE, next), `campo ${String(field)}`).toBe(true);
    }
  });

  it("trata cadena vacía en empleador y apellidos como null (|| null)", () => {
    // El existing tiene null; el payload trae "" → se normaliza a null → sin cambio.
    const existing = { ...EMPLOYEE, empleador: null, apellidos: null };
    const next = { ...payloadFrom(existing), empleador: "", apellidos: "" };
    expect(hasEmployeeChanged(existing, next)).toBe(false);
  });

  it("distingue null de una cadena con contenido", () => {
    const existing = { ...EMPLOYEE, email: null };
    const next = { ...payloadFrom(existing), email: "nuevo@example.com" };
    expect(hasEmployeeChanged(existing, next)).toBe(true);
  });
});

describe("buildOfferPayload", () => {
  const row = { id: "row-1", batch_id: "batch-1" } as RawImportRow;

  function build(normalized: NormalizedPayload) {
    return buildOfferPayload(row, "emp-1", normalized, "hash-abc");
  }

  it("una fila elegible produce oferta vigente y aceptada", () => {
    const offer = build({ is_eligible: true, monto_prestamo_autorizado: 5000 });
    expect(offer.status).toBe("vigente");
    expect(offer.estatus_conversion).toBe("aceptada");
    expect(offer.is_current).toBe(true);
    expect(offer.monto_prestamo_autorizado).toBe(5000);
  });

  it("una fila no elegible produce oferta rechazada", () => {
    const offer = build({ is_eligible: false, monto_prestamo_autorizado: 5000 });
    expect(offer.status).toBe("rechazada");
    expect(offer.estatus_conversion).toBe("rechazada");
  });

  it("monto ausente cae a 0, no a null (la columna es numérica)", () => {
    const offer = build({ is_eligible: false });
    expect(offer.monto_prestamo_autorizado).toBe(0);
  });

  it("propaga el hash y la procedencia para la idempotencia", () => {
    const offer = build({ is_eligible: true, monto_prestamo_autorizado: 1 });
    expect(offer.source_hash).toBe("hash-abc");
    expect(offer.source_batch_id).toBe("batch-1");
    expect(offer.source_row_id).toBe("row-1");
  });

  it("convierte estatus opcionales vacíos en null", () => {
    const offer = build({ is_eligible: true, monto_prestamo_autorizado: 1, estatus_p_esta_q: "", estatus_cliente: "" });
    expect(offer.estatus_p_esta_q).toBeNull();
    expect(offer.estatus_cliente).toBeNull();
  });
});

describe("requireString", () => {
  it("devuelve el valor cuando es una cadena no vacía", () => {
    expect(requireString("hola", "falló")).toBe("hola");
  });

  it("lanza con el mensaje dado en cadena vacía, null o no-cadena", () => {
    expect(() => requireString("", "vacío")).toThrow("vacío");
    expect(() => requireString(null, "nulo")).toThrow("nulo");
    expect(() => requireString(123, "número")).toThrow("número");
    expect(() => requireString(undefined, "indef")).toThrow("indef");
  });
});
