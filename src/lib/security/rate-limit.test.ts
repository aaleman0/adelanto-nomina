import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { checkRateLimit, getClientIp, __resetRateLimitStore } from "./rate-limit";

const CONFIG = { name: "test", limit: 3, windowMs: 1000 };

beforeEach(() => {
  __resetRateLimitStore();
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("checkRateLimit", () => {
  it("permite peticiones hasta el límite y luego bloquea", () => {
    const r1 = checkRateLimit(CONFIG, "1.1.1.1");
    const r2 = checkRateLimit(CONFIG, "1.1.1.1");
    const r3 = checkRateLimit(CONFIG, "1.1.1.1");
    const r4 = checkRateLimit(CONFIG, "1.1.1.1");

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(r3.ok).toBe(true);
    expect(r4.ok).toBe(false);
  });

  it("decrementa remaining con cada petición", () => {
    expect(checkRateLimit(CONFIG, "ip").remaining).toBe(2);
    expect(checkRateLimit(CONFIG, "ip").remaining).toBe(1);
    expect(checkRateLimit(CONFIG, "ip").remaining).toBe(0);
    expect(checkRateLimit(CONFIG, "ip").remaining).toBe(0);
  });

  it("cuenta por identificador de forma independiente", () => {
    checkRateLimit(CONFIG, "a");
    checkRateLimit(CONFIG, "a");
    checkRateLimit(CONFIG, "a");

    // Otra IP arranca con su propia cuenta intacta.
    expect(checkRateLimit(CONFIG, "b").ok).toBe(true);
    expect(checkRateLimit(CONFIG, "a").ok).toBe(false);
  });

  it("separa por nombre de limitador aunque coincida el identificador", () => {
    const a = { name: "limiter-a", limit: 1, windowMs: 1000 };
    const b = { name: "limiter-b", limit: 1, windowMs: 1000 };

    expect(checkRateLimit(a, "misma-ip").ok).toBe(true);
    // Mismo identificador, otro limitador: no comparten cuota.
    expect(checkRateLimit(b, "misma-ip").ok).toBe(true);
    expect(checkRateLimit(a, "misma-ip").ok).toBe(false);
  });

  it("reinicia la cuenta al expirar la ventana", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    checkRateLimit(CONFIG, "ip");
    checkRateLimit(CONFIG, "ip");
    checkRateLimit(CONFIG, "ip");
    expect(checkRateLimit(CONFIG, "ip").ok).toBe(false);

    // Pasada la ventana, vuelve a permitir.
    vi.advanceTimersByTime(1001);
    expect(checkRateLimit(CONFIG, "ip").ok).toBe(true);
  });

  it("informa retryAfterSeconds solo cuando bloquea", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    expect(checkRateLimit(CONFIG, "ip").retryAfterSeconds).toBe(0);
    checkRateLimit(CONFIG, "ip");
    checkRateLimit(CONFIG, "ip");
    const blocked = checkRateLimit(CONFIG, "ip");
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(1);
  });
});

describe("getClientIp", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("toma la primera IP de x-forwarded-for (sin TRUSTED_PROXY_COUNT)", () => {
    const req = new Request("http://x", {
      headers: { "x-forwarded-for": "203.0.113.5, 10.0.0.1, 10.0.0.2" },
    });
    expect(getClientIp(req)).toBe("203.0.113.5");
  });

  it("con TRUSTED_PROXY_COUNT=1 toma la IP más a la derecha, no la falsificable", () => {
    // El cliente controla la primera entrada; con 1 proxy de confianza (Cloud
    // Run) la IP real es la que añade ese proxy: la última.
    vi.stubEnv("TRUSTED_PROXY_COUNT", "1");
    const req = new Request("http://x", {
      headers: { "x-forwarded-for": "6.6.6.6, 203.0.113.5" },
    });
    expect(getClientIp(req)).toBe("203.0.113.5");
  });

  it("con TRUSTED_PROXY_COUNT=2 toma la 2ª entrada desde la derecha", () => {
    vi.stubEnv("TRUSTED_PROXY_COUNT", "2");
    const req = new Request("http://x", {
      headers: { "x-forwarded-for": "6.6.6.6, 203.0.113.5, 10.0.0.1" },
    });
    expect(getClientIp(req)).toBe("203.0.113.5");
  });

  it("cae a x-real-ip si no hay forwarded-for", () => {
    const req = new Request("http://x", { headers: { "x-real-ip": "198.51.100.7" } });
    expect(getClientIp(req)).toBe("198.51.100.7");
  });

  it("agrupa como 'unknown' cuando no hay ninguna cabecera", () => {
    // Intencionado: sin IP identificable, todos comparten cuota en vez de
    // evadir el límite quedando fuera.
    expect(getClientIp(new Request("http://x"))).toBe("unknown");
  });
});
