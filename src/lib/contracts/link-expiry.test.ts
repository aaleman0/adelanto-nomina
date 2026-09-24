import { describe, it, expect } from "vitest";
import { estaVencido } from "./link-expiry";
import { LINK_TTL_HOURS } from "./link-ttl";

/**
 * La regla del negocio: el enlace de firma vive lo que diga `LINK_TTL_HOURS`
 * —hoy un día—. Dentro de su plazo se pasa a firmar; fuera, no se deja. Estas
 * pruebas fijan el borde exacto para que un cambio futuro no lo mueva sin
 * querer, y se leen del propio TTL para no quedarse hablando de un plazo viejo.
 */
describe("estaVencido", () => {
  const ahora = new Date("2026-09-06T12:00:00.000Z").getTime();
  const enHoras = (h: number) => new Date(ahora + h * 60 * 60 * 1000).toISOString();

  it("DENTRO del plazo → deja firmar", () => {
    expect(estaVencido(enHoras(LINK_TTL_HOURS), ahora)).toBe(false); // recién generado
    expect(estaVencido(enHoras(1), ahora)).toBe(false); // le queda 1 hora
    expect(estaVencido(enHoras(0.01), ahora)).toBe(false); // le quedan segundos
  });

  it("FUERA del plazo → no lo deja", () => {
    expect(estaVencido(enHoras(-0.01), ahora)).toBe(true); // venció hace segundos
    expect(estaVencido(enHoras(-1), ahora)).toBe(true);
    expect(estaVencido(enHoras(-(LINK_TTL_HOURS + 1)), ahora)).toBe(true);
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
