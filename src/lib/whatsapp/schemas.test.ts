import { describe, it, expect } from "vitest";
import {
  BulkSendBodySchema,
  BulkHistoryQuerySchema,
  BulkDetailQuerySchema,
  EmployeeSearchQuerySchema,
  PhoneFixEntrySchema,
  PhoneAuditFixBodySchema,
} from "./schemas";

const UUID = "00000000-0000-0000-0000-000000000000";

/** Devuelve las rutas de los campos que fallaron. */
function failedPaths(result: { success: boolean; error?: { issues: Array<{ path: PropertyKey[] }> } }) {
  return result.error?.issues.map((i) => i.path.join(".")) ?? [];
}

describe("BulkSendBodySchema", () => {
  it("acepta mode=import con importId", () => {
    const result = BulkSendBodySchema.safeParse({ mode: "import", importId: UUID });
    expect(result.success).toBe(true);
  });

  it("acepta mode=manual con employeeIds", () => {
    const result = BulkSendBodySchema.safeParse({ mode: "manual", employeeIds: [UUID] });
    expect(result.success).toBe(true);
  });

  it("rechaza sin mode y señala el campo", () => {
    const result = BulkSendBodySchema.safeParse({});
    expect(result.success).toBe(false);
    expect(failedPaths(result)).toContain("mode");
  });

  it("rechaza un mode desconocido", () => {
    const result = BulkSendBodySchema.safeParse({ mode: "broadcast" });
    expect(result.success).toBe(false);
    expect(failedPaths(result)).toContain("mode");
  });

  it("rechaza mode=import sin importId", () => {
    const result = BulkSendBodySchema.safeParse({ mode: "import" });
    expect(result.success).toBe(false);
    expect(failedPaths(result)).toContain("importId");
  });

  it("rechaza mode=manual con employeeIds vacío", () => {
    const result = BulkSendBodySchema.safeParse({ mode: "manual", employeeIds: [] });
    expect(result.success).toBe(false);
    expect(failedPaths(result)).toContain("employeeIds");
  });

  it("rechaza ids que no son UUID", () => {
    const result = BulkSendBodySchema.safeParse({ mode: "manual", employeeIds: ["no-soy-uuid"] });
    expect(result.success).toBe(false);
  });


  it("acepta mode=status con un estado válido (acción por etapa)", () => {
    const result = BulkSendBodySchema.safeParse({ mode: "status", status: "pendiente_envio" });
    expect(result.success).toBe(true);
  });

  it("rechaza mode=status sin status", () => {
    const result = BulkSendBodySchema.safeParse({ mode: "status" });
    expect(result.success).toBe(false);
    expect(failedPaths(result)).toContain("status");
  });

  it("rechaza un status fuera de la lista permitida", () => {
    // Solo se puede enviar en bloque a etapas donde tiene sentido el primer
    // contacto; reenviar la plantilla inicial a otras sería incorrecto.
    const result = BulkSendBodySchema.safeParse({ mode: "status", status: "firmado" });
    expect(result.success).toBe(false);
  });
});

describe("BulkHistoryQuerySchema", () => {
  it("aplica valores por defecto cuando no llega nada", () => {
    const result = BulkHistoryQuerySchema.parse({});
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
  });

  it("convierte cadenas a números", () => {
    const result = BulkHistoryQuerySchema.parse({ page: "2", pageSize: "5" });
    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(5);
  });

  it("acota pageSize a 100 en vez de caer al valor por defecto", () => {
    expect(BulkHistoryQuerySchema.parse({ pageSize: "5000" }).pageSize).toBe(100);
  });

  it("cae al valor por defecto con paginación no numérica en vez de romper", () => {
    // Antes, Number("abc") daba NaN y provocaba un 500 al construir el range.
    const result = BulkHistoryQuerySchema.parse({ page: "abc" });
    expect(result.page).toBe(1);
  });

  it("acepta los filtros válidos", () => {
    const result = BulkHistoryQuerySchema.parse({ status: "completed", mode: "import" });
    expect(result.status).toBe("completed");
    expect(result.mode).toBe("import");
  });

  it("rechaza un status desconocido", () => {
    expect(BulkHistoryQuerySchema.safeParse({ status: "explotado" }).success).toBe(false);
  });

  it("convierte fechas válidas a Date", () => {
    const result = BulkHistoryQuerySchema.parse({ dateFrom: "2026-01-01" });
    expect(result.dateFrom).toBeInstanceOf(Date);
  });

  it("rechaza una fecha no parseable en vez de generar un Invalid Date", () => {
    // Antes, new Date("ayer").toISOString() lanzaba y devolvía 500.
    expect(BulkHistoryQuerySchema.safeParse({ dateFrom: "ayer" }).success).toBe(false);
  });
});

describe("BulkDetailQuerySchema", () => {
  it("exige id y lo señala cuando falta", () => {
    const result = BulkDetailQuerySchema.safeParse({});
    expect(result.success).toBe(false);
    expect(failedPaths(result)).toContain("id");
  });

  it("rechaza un id que no es UUID", () => {
    expect(BulkDetailQuerySchema.safeParse({ id: "123" }).success).toBe(false);
  });

  it("acepta un id válido y aplica defaults", () => {
    const result = BulkDetailQuerySchema.parse({ id: UUID });
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(50);
  });

  it("acota pageSize a 200", () => {
    expect(BulkDetailQuerySchema.parse({ id: UUID, pageSize: "9999" }).pageSize).toBe(200);
  });
});

describe("EmployeeSearchQuerySchema", () => {
  it("aplica defaults", () => {
    const result = EmployeeSearchQuerySchema.parse({});
    expect(result.q).toBe("");
    expect(result.limit).toBe(10);
  });

  it("acota limit a 25", () => {
    expect(EmployeeSearchQuerySchema.parse({ limit: "100" }).limit).toBe(25);
  });

  it("recorta espacios del término", () => {
    expect(EmployeeSearchQuerySchema.parse({ q: "  perez  " }).q).toBe("perez");
  });

  it("rechaza términos absurdamente largos", () => {
    expect(EmployeeSearchQuerySchema.safeParse({ q: "x".repeat(200) }).success).toBe(false);
  });
});

describe("PhoneFixEntrySchema", () => {
  it("normaliza el teléfono a solo dígitos", () => {
    const result = PhoneFixEntrySchema.parse({
      employee_id: UUID,
      telefono_normalizado: "+52 1 81 8018-8991",
    });
    expect(result.telefono_normalizado).toBe("5218180188991");
  });

  it("rechaza un teléfono demasiado corto", () => {
    const result = PhoneFixEntrySchema.safeParse({
      employee_id: UUID,
      telefono_normalizado: "12345",
    });
    expect(result.success).toBe(false);
  });

  it("rechaza un teléfono demasiado largo", () => {
    const result = PhoneFixEntrySchema.safeParse({
      employee_id: UUID,
      telefono_normalizado: "1".repeat(16),
    });
    expect(result.success).toBe(false);
  });

  it("rechaza un employee_id que no es UUID", () => {
    const result = PhoneFixEntrySchema.safeParse({
      employee_id: "bulk",
      telefono_normalizado: "5218180188991",
    });
    expect(result.success).toBe(false);
  });
});

describe("PhoneAuditFixBodySchema", () => {
  it("rechaza un array vacío", () => {
    expect(PhoneAuditFixBodySchema.safeParse({ fixes: [] }).success).toBe(false);
  });

  it("rechaza si fixes no es un array", () => {
    expect(PhoneAuditFixBodySchema.safeParse({ fixes: "todos" }).success).toBe(false);
  });

  it("acepta el sobre sin validar cada entrada (se validan de una en una)", () => {
    // Así una corrección inválida no tumba el lote completo.
    const result = PhoneAuditFixBodySchema.safeParse({ fixes: [{ basura: true }] });
    expect(result.success).toBe(true);
  });
});

describe("uuidParam", () => {
  it("acepta UUIDs de cualquier versión, como el tipo uuid de Postgres", () => {
    // z.string().uuid() de Zod 4 rechaza estos por el nibble de versión, pero
    // Postgres los almacena sin problema y las pruebas E2E los usan como ids
    // inexistentes.
    for (const id of [
      "00000000-0000-0000-0000-000000000000",
      "00000000-0000-0000-0000-000000000001",
      "ffffffff-ffff-ffff-ffff-ffffffffffff",
    ]) {
      expect(BulkDetailQuerySchema.safeParse({ id }).success).toBe(true);
    }
  });

  it("acepta mayúsculas", () => {
    const id = "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE";
    expect(BulkDetailQuerySchema.safeParse({ id }).success).toBe(true);
  });

  it("rechaza lo que no tiene forma de UUID", () => {
    for (const id of ["123", "no-soy-uuid", "00000000-0000-0000-0000-00000000000", ""]) {
      expect(BulkDetailQuerySchema.safeParse({ id }).success).toBe(false);
    }
  });
});
