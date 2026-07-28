import { describe, it, expect } from "vitest";
import { buildDedupKey } from "./bulk-send";

// Ventana de dedup = 5 min = 300_000 ms. La clave usa buckets alineados a tiempo
// absoluto: floor(now / 300000).
const WINDOW = 300_000;

describe("buildDedupKey", () => {
  it("misma ventana, mismo empleado y plantilla → misma clave", () => {
    const base = 3 * WINDOW; // inicio del bucket 3
    expect(buildDedupKey("emp-1", "plantilla-a", base)).toBe(
      buildDedupKey("emp-1", "plantilla-a", base + WINDOW - 1),
    );
  });

  it("ventana siguiente → clave distinta", () => {
    const base = 3 * WINDOW;
    expect(buildDedupKey("emp-1", "plantilla-a", base)).not.toBe(
      buildDedupKey("emp-1", "plantilla-a", base + WINDOW),
    );
  });

  it("distinto empleado o plantilla → clave distinta en la misma ventana", () => {
    const t = 3 * WINDOW;
    const k = buildDedupKey("emp-1", "plantilla-a", t);
    expect(k).not.toBe(buildDedupKey("emp-2", "plantilla-a", t));
    expect(k).not.toBe(buildDedupKey("emp-1", "plantilla-b", t));
  });

  it("la clave incluye empleado, plantilla y bucket", () => {
    expect(buildDedupKey("emp-1", "plantilla-a", 3 * WINDOW)).toBe("emp-1:plantilla-a:3");
  });
});
