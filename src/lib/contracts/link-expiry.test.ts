import { describe, it, expect } from "vitest";
import { estaVencido } from "./link-expiry";

/**
 * La regla del negocio: el enlace de firma vive 2 horas. Dentro de la ventana
 * se pasa a firmar; fuera, no se deja. Estas pruebas fijan el borde exacto para
 * que un cambio futuro no lo mueva sin querer.
 */
describe("estaVencido", () => {
  const ahora = new Date("2026-09-06T12:00:00.000Z").getTime();
  const enHoras = (h: number) => new Date(ahora + h * 60 * 60 * 1000).toISOString();

  it("DENTRO de las 2 horas → deja firmar", () => {
    expect(estaVencido(enHoras(2), ahora)).toBe(false); // recién generado
    expect(estaVencido(enHoras(1), ahora)).toBe(false); // le queda 1 hora
    expect(estaVencido(enHoras(0.01), ahora)).toBe(false); // le quedan segundos
  });

  it("FUERA de las 2 horas → no lo deja", () => {
    expect(estaVencido(enHoras(-0.01), ahora)).toBe(true); // venció hace segundos
    expect(estaVencido(enHoras(-1), ahora)).toBe(true);
    expect(estaVencido(enHoras(-48), ahora)).toBe(true);
  });

  it("justo en el segundo del vencimiento → no lo deja (el borde cierra)", () => {
    expect(estaVencido(new Date(ahora).toISOString(), ahora)).toBe(true);
  });

  it("sin fecha o con fecha ilegible → no lo deja (lado seguro)", () => {
    expect(estaVencido(null, ahora)).toBe(true);
    expect(estaVencido(undefined, ahora)).toBe(true);
    expect(estaVencido("no-es-una-fecha", ahora)).toBe(true);
  });
});
