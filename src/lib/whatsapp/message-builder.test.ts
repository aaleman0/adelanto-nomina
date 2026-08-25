import { describe, it, expect } from "vitest";
import { buildBulkTemplateMessage, DEFAULT_BULK_TEMPLATE } from "./message-builder";
import type { BulkRecipient } from "./message-builder";

const base: BulkRecipient = {
  employee_id: "00000000-0000-0000-0000-000000000000",
  nombre: "Juan",
  empleador: "LOZAV",
  rfc: "AAAA000000AAA",
  telefono_normalizado: "5218180188991",
  monto_prestamo_autorizado: 5000,
};

describe("buildBulkTemplateMessage", () => {
  it("construye la plantilla v2 con 3 variables", () => {
    const result = buildBulkTemplateMessage(base, DEFAULT_BULK_TEMPLATE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.variables).toEqual({ "1": "Juan", "2": "LOZAV", "3": "5,000" });
    expect(result.to).toBe("5218180188991");
  });

  it("construye la plantilla legada con solo 2 variables", () => {
    const result = buildBulkTemplateMessage(base, "adelanto_nomina");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.variables).toEqual({ "1": "Juan", "2": "5,000" });
  });

  it("falla cuando no hay teléfono utilizable", () => {
    const result = buildBulkTemplateMessage({ ...base, telefono_normalizado: null });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/tel/i);
  });

  it("usa valores de respaldo cuando faltan nombre y empleador", () => {
    const result = buildBulkTemplateMessage({ ...base, nombre: null, empleador: null });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.variables["1"]).toBe("Empleado");
    expect(result.variables["2"]).toBe("Tu empresa");
  });

  it("muestra N/A cuando no hay monto", () => {
    const result = buildBulkTemplateMessage({ ...base, monto_prestamo_autorizado: null });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.variables["3"]).toBe("N/A");
  });

  it("añade la cabecera de imagen solo en la plantilla v2", () => {
    const conImagen = buildBulkTemplateMessage(base, DEFAULT_BULK_TEMPLATE, {
      headerImageUrl: "https://cdn.example.com/x.png",
    });
    expect(conImagen.ok).toBe(true);
    if (!conImagen.ok) return;
    expect(conImagen.components[0].type).toBe("header");

    // En la plantilla legada la cabecera no está declarada: enviarla haría que
    // Meta rechazara el mensaje.
    const legada = buildBulkTemplateMessage(base, "adelanto_nomina", {
      headerImageUrl: "https://cdn.example.com/x.png",
    });
    expect(legada.ok).toBe(true);
    if (!legada.ok) return;
    expect(legada.components.some((c) => c.type === "header")).toBe(false);
  });

  it("omite la cabecera si no hay URL configurada", () => {
    const result = buildBulkTemplateMessage(base, DEFAULT_BULK_TEMPLATE, { headerImageUrl: null });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.components).toHaveLength(1);
    expect(result.components[0].type).toBe("body");
  });

  it("añade el parámetro del botón URL usando solo el sufijo del link", () => {
    const result = buildBulkTemplateMessage(base, DEFAULT_BULK_TEMPLATE, {
      buttonUrl: "https://adelanto-nomina.com/firmar/sig-test-123",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.components.at(-1)).toEqual({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: "sig-test-123" }],
    });
  });

  it("produce el mismo mensaje para el envío inline y para el worker", () => {
    // Es la razón de existir del módulo: ambos caminos comparten esta función,
    // así que un cambio de formato no puede divergir entre uno y otro.
    const a = buildBulkTemplateMessage(base, DEFAULT_BULK_TEMPLATE, { headerImageUrl: "https://x/y.png" });
    const b = buildBulkTemplateMessage({ ...base }, DEFAULT_BULK_TEMPLATE, { headerImageUrl: "https://x/y.png" });
    expect(a).toEqual(b);
  });
});
