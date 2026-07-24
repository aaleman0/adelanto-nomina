import { describe, it, expect, afterEach, vi } from "vitest";
import { isEmailAllowed } from "./access-allowlist";

afterEach(() => vi.unstubAllEnvs());

describe("isEmailAllowed", () => {
  it("sin allow-lists configuradas, permite a cualquiera", () => {
    expect(isEmailAllowed("quien@sea.com")).toBe(true);
  });

  it("ALLOWED_EMAILS: sólo los correos exactos (case-insensitive)", () => {
    vi.stubEnv("ALLOWED_EMAILS", "ana@x.com, beto@x.com");
    expect(isEmailAllowed("ana@x.com")).toBe(true);
    expect(isEmailAllowed("ANA@X.COM")).toBe(true);
    expect(isEmailAllowed("otro@x.com")).toBe(false);
  });

  it("ALLOWED_EMAIL_DOMAINS: cualquiera del dominio", () => {
    vi.stubEnv("ALLOWED_EMAIL_DOMAINS", "x.com");
    expect(isEmailAllowed("quien@x.com")).toBe(true);
    expect(isEmailAllowed("quien@y.com")).toBe(false);
  });

  it("combina ambas listas (correo externo puntual + dominio)", () => {
    vi.stubEnv("ALLOWED_EMAILS", "externo@fuera.com");
    vi.stubEnv("ALLOWED_EMAIL_DOMAINS", "x.com");
    expect(isEmailAllowed("alguien@x.com")).toBe(true);
    expect(isEmailAllowed("externo@fuera.com")).toBe(true);
    expect(isEmailAllowed("otro@fuera.com")).toBe(false);
  });

  it("con restricción activa, rechaza correo ausente o mal formado", () => {
    vi.stubEnv("ALLOWED_EMAILS", "ana@x.com");
    expect(isEmailAllowed(null)).toBe(false);
    expect(isEmailAllowed("")).toBe(false);
    expect(isEmailAllowed("sinarroba")).toBe(false);
  });
});
