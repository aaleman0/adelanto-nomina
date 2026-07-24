import { describe, it, expect } from "vitest";
import { montoEnLetra } from "@/lib/easylex/monto-en-letra";

describe("montoEnLetra", () => {
  it("convierte montos enteros con centavos en cero", () => {
    expect(montoEnLetra(0)).toBe("CERO PESOS 00/100 M.N.");
    expect(montoEnLetra(1)).toBe("UN PESO 00/100 M.N.");
    expect(montoEnLetra(100)).toBe("CIEN PESOS 00/100 M.N.");
    expect(montoEnLetra(1000)).toBe("MIL PESOS 00/100 M.N.");
    expect(montoEnLetra(5000)).toBe("CINCO MIL PESOS 00/100 M.N.");
  });

  it("convierte montos con centavos", () => {
    expect(montoEnLetra(0.5)).toBe("CERO PESOS 50/100 M.N.");
    expect(montoEnLetra(15250.5)).toBe("QUINCE MIL DOSCIENTOS CINCUENTA PESOS 50/100 M.N.");
    expect(montoEnLetra(1234567.89)).toBe(
      "UN MILLÓN DOSCIENTOS TREINTA Y CUATRO MIL QUINIENTOS SESENTA Y SIETE PESOS 89/100 M.N.",
    );
  });

  it("maneja cantidades mayores a un millón", () => {
    expect(montoEnLetra(1000000)).toBe("UN MILLÓN PESOS 00/100 M.N.");
    expect(montoEnLetra(999999999.99)).toBe(
      "NOVECIENTOS NOVENTA Y NUEVE MILLONES NOVECIENTOS NOVENTA Y NUEVE MIL NOVECIENTOS NOVENTA Y NUEVE PESOS 99/100 M.N.",
    );
  });

  it("redondea a dos decimales", () => {
    expect(montoEnLetra(10.999)).toBe("ONCE PESOS 00/100 M.N.");
    expect(montoEnLetra(10.994)).toBe("DIEZ PESOS 99/100 M.N.");
  });
});
