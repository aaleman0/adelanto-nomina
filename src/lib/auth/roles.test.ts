import { describe, it, expect, vi, afterEach } from "vitest";
import { hasRole, getRbacMode } from "./roles";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("hasRole", () => {
  it("admin cumple cualquier requisito", () => {
    expect(hasRole("admin", "admin")).toBe(true);
    expect(hasRole("admin", "operaciones")).toBe(true);
    expect(hasRole("admin", "solo_lectura")).toBe(true);
  });

  it("operaciones no alcanza admin", () => {
    expect(hasRole("operaciones", "admin")).toBe(false);
    expect(hasRole("operaciones", "operaciones")).toBe(true);
    expect(hasRole("operaciones", "solo_lectura")).toBe(true);
  });

  it("solo_lectura solo cumple lectura", () => {
    expect(hasRole("solo_lectura", "admin")).toBe(false);
    expect(hasRole("solo_lectura", "operaciones")).toBe(false);
    expect(hasRole("solo_lectura", "solo_lectura")).toBe(true);
  });

  it("los roles son acumulativos, no exclusivos", () => {
    // Un admin debe poder hacer todo lo de operaciones sin necesitar ese rol.
    const roles = ["solo_lectura", "operaciones", "admin"] as const;
    roles.forEach((actual, i) => {
      roles.slice(0, i + 1).forEach((minimo) => {
        expect(hasRole(actual, minimo)).toBe(true);
      });
      roles.slice(i + 1).forEach((minimo) => {
        expect(hasRole(actual, minimo)).toBe(false);
      });
    });
  });
});

describe("getRbacMode", () => {
  it("por defecto es warn, para no bloquear a nadie al desplegar", () => {
    // Todos los perfiles nacen como solo_lectura: activar enforce sin haber
    // promovido a nadie dejaría la aplicación sin operadores.
    expect(getRbacMode()).toBe("warn");
  });

  it("es enforce solo con el valor exacto", () => {
    vi.stubEnv("RBAC_ENFORCEMENT", "enforce");
    expect(getRbacMode()).toBe("enforce");
  });

  it("cualquier otro valor cae a warn", () => {
    vi.stubEnv("RBAC_ENFORCEMENT", "true");
    expect(getRbacMode()).toBe("warn");
    vi.stubEnv("RBAC_ENFORCEMENT", "ENFORCE");
    expect(getRbacMode()).toBe("warn");
  });
});
