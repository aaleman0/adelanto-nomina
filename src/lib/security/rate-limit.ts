import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";

/**
 * Límite de tasa por ventana fija, en memoria.
 *
 * LIMITACIÓN IMPORTANTE, léela antes de confiar en esto: el estado vive en la
 * memoria del proceso. Con varias instancias (Cloud Run escala a N), cada una
 * lleva su propia cuenta, así que el límite efectivo es `límite × instancias`.
 * No sirve como control preciso ni como defensa contra un atacante distribuido.
 *
 * Para qué SÍ sirve: frenar el abuso trivial —un cliente descontrolado, un bucle
 * de reintentos, un script contra el webhook— sin añadir Redis. Cuando haga
 * falta un límite global exacto, se sustituye el store por Upstash/Redis
 * conservando esta misma interfaz.
 *
 * Ventana fija en vez de sliding window o token bucket: es la que se puede
 * razonar de un vistazo y no necesita estructuras por petición. Su única
 * pega —permitir hasta 2× en el borde entre ventanas— es irrelevante para el
 * propósito de arriba.
 */

type Counter = { count: number; resetAt: number };

// Un único mapa para todos los limitadores; la clave lo segmenta por endpoint.
const store = new Map<string, Counter>();

// Barrido perezoso: se limpia lo caducado cada tantas escrituras, para no dejar
// crecer el mapa sin un temporizador de fondo (que además Next desaconseja en
// serverless). No hay setInterval que fugue.
let writesSinceSweep = 0;
const SWEEP_EVERY = 500;

function sweep(now: number) {
  for (const [key, counter] of store) {
    if (counter.resetAt <= now) store.delete(key);
  }
}

export type RateLimitConfig = {
  /** Identificador del limitador, p. ej. "webhook:whatsapp". Segmenta el store. */
  name: string;
  /** Peticiones permitidas por ventana. */
  limit: number;
  /** Duración de la ventana en milisegundos. */
  windowMs: number;
};

export type RateLimitResult = {
  ok: boolean;
  /** Peticiones restantes en la ventana actual. */
  remaining: number;
  /** Momento (epoch ms) en que la ventana se reinicia. */
  resetAt: number;
  /** Segundos hasta el reinicio; para la cabecera Retry-After. */
  retryAfterSeconds: number;
};

/**
 * Registra una petición y dice si excede el límite.
 *
 * `identifier` distingue a quien llama dentro del mismo limitador: normalmente
 * la IP. Se combina con `config.name` para que dos endpoints no compartan cuota.
 */
export function checkRateLimit(config: RateLimitConfig, identifier: string): RateLimitResult {
  const now = Date.now();
  const key = `${config.name}:${identifier}`;

  if (++writesSinceSweep >= SWEEP_EVERY) {
    writesSinceSweep = 0;
    sweep(now);
  }

  const existing = store.get(key);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + config.windowMs;
    store.set(key, { count: 1, resetAt });
    return { ok: true, remaining: config.limit - 1, resetAt, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  const remaining = Math.max(0, config.limit - existing.count);
  const ok = existing.count <= config.limit;

  return {
    ok,
    remaining,
    resetAt: existing.resetAt,
    retryAfterSeconds: ok ? 0 : Math.ceil((existing.resetAt - now) / 1000),
  };
}

/**
 * Extrae la IP del cliente de las cabeceras de reenvío.
 *
 * Detrás de Cloud Run / un balanceador, `x-forwarded-for` es una lista y la IP
 * del cliente es la primera. Si no hay ninguna se cae a "unknown", que agrupa a
 * todos esos bajo una sola cuota: es intencionado, así un origen sin IP
 * identificable no evade el límite quedando fuera.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * Aplica un límite y, si se excede, devuelve la respuesta 429 lista para
 * retornar. Devuelve `null` cuando la petición puede continuar.
 *
 *   const limited = enforceRateLimit(request, { name: "...", limit: 60, windowMs: 60_000 });
 *   if (limited) return limited;
 */
export function enforceRateLimit(request: Request, config: RateLimitConfig): NextResponse | null {
  const identifier = getClientIp(request);
  const result = checkRateLimit(config, identifier);

  if (result.ok) return null;

  logger.warn("rate_limit.exceeded", {
    limiter: config.name,
    identifier,
    limit: config.limit,
    retryAfterSeconds: result.retryAfterSeconds,
  });

  return NextResponse.json(
    { ok: false, error: "Demasiadas peticiones. Inténtalo de nuevo más tarde." },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.retryAfterSeconds),
        "X-RateLimit-Limit": String(config.limit),
        "X-RateLimit-Remaining": String(result.remaining),
        "X-RateLimit-Reset": String(Math.floor(result.resetAt / 1000)),
      },
    },
  );
}

/** Solo para pruebas: vacía el estado entre casos. */
export function __resetRateLimitStore() {
  store.clear();
  writesSinceSweep = 0;
}
