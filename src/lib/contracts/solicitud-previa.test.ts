import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { evaluarSolicitudPrevia, MARGEN_PARA_REUSAR_MS, solicitudPrevia } from "./solicitud-previa";

const AHORA = Date.parse("2026-09-07T18:00:00Z");
const MIN = 60_000;
const dentroDe = (minutos: number) => new Date(AHORA + minutos * MIN).toISOString();
const enlace = (vence: string, status = "generado") => ({
  status,
  signing_url: "https://easylex.test/firma/abc",
  expires_at: vence,
});

/**
 * A quien ya pidió no se le genera otro contrato fuera de la ventana. Lo que
 * cuidan estas pruebas es que se le diga lo cierto: que se le entregue el
 * enlace que sí tiene, y que nunca se le prometa uno que no existe.
 */
describe("evaluarSolicitudPrevia", () => {
  it("con un enlace vigente, se le entrega", () => {
    expect(evaluarSolicitudPrevia("link_generado", enlace(dentroDe(60)), AHORA)).toBe("enlace_vigente");
  });

  it("un enlace a punto de vencer no se entrega: el pipeline podría crear otro contrato", () => {
    expect(evaluarSolicitudPrevia("link_generado", enlace(dentroDe(1)), AHORA)).toBe("enlace_vencido");
    expect(MARGEN_PARA_REUSAR_MS).toBeGreaterThan(1 * MIN);
  });

  it("un enlace vencido no se entrega", () => {
    expect(evaluarSolicitudPrevia("link_generado", enlace(dentroDe(-10)), AHORA)).toBe("enlace_vencido");
  });

  it("un intento sin enlace no se entrega aunque no haya vencido", () => {
    expect(
      evaluarSolicitudPrevia("link_generado", { status: "generado", signing_url: null, expires_at: dentroDe(60) }, AHORA),
    ).toBe("enlace_vencido");
  });

  it("si al pedir se cayó el contrato, lo dice en vez de prometer un enlace", () => {
    expect(evaluarSolicitudPrevia("error", null, AHORA)).toBe("fallo");
    expect(evaluarSolicitudPrevia("generando", { status: "error", signing_url: null, expires_at: null }, AHORA)).toBe(
      "fallo",
    );
  });

  it("el enlace que regeneró un operador gana sobre la falla anterior", () => {
    expect(evaluarSolicitudPrevia("error", enlace(dentroDe(90)), AHORA)).toBe("enlace_vigente");
  });

  it("sin enlace ni falla, sigue en proceso", () => {
    expect(evaluarSolicitudPrevia("generando", null, AHORA)).toBe("en_proceso");
    expect(evaluarSolicitudPrevia(null, null, AHORA)).toBe("en_proceso");
  });
});

type Resultado = { data: unknown; error: unknown };

function consulta(resultado: Resultado) {
  const llamadas: unknown[][] = [];
  const q: Record<string, unknown> = {
    maybeSingle: () => {
      llamadas.push(["maybeSingle"]);
      return Promise.resolve(resultado);
    },
  };
  for (const metodo of ["select", "eq", "order", "limit"]) {
    q[metodo] = (...args: unknown[]) => {
      llamadas.push([metodo, ...args]);
      return q;
    };
  }
  return { q, llamadas };
}

function baseCon(colas: Record<string, ReturnType<typeof consulta>[]>) {
  vi.mocked(getSupabaseAdmin).mockReturnValue({
    from: (tabla: string) => {
      const siguiente = colas[tabla]?.shift();
      if (!siguiente) throw new Error(`consulta inesperada a ${tabla}`);
      return siguiente.q;
    },
  } as never);
}

beforeEach(() => {
  vi.mocked(getSupabaseAdmin).mockReset();
});

describe("solicitudPrevia", () => {
  it("lee la solicitud de esa oferta y su último intento, en el orden del pipeline", async () => {
    const solicitud = consulta({ data: { id: "req-1", status: "link_generado" }, error: null });
    const intento = consulta({ data: enlace(new Date(Date.now() + 60 * MIN).toISOString()), error: null });
    baseCon({ contract_requests: [solicitud], contract_attempts: [intento] });

    expect(await solicitudPrevia("of-1")).toBe("enlace_vigente");
    expect(solicitud.llamadas).toContainEqual(["eq", "offer_id", "of-1"]);
    expect(intento.llamadas).toContainEqual(["eq", "contract_request_id", "req-1"]);
    expect(intento.llamadas).toContainEqual(["order", "attempt_number", { ascending: false }]);
  });

  it("sin solicitud registrada, sigue en proceso", async () => {
    baseCon({ contract_requests: [consulta({ data: null, error: null })] });
    expect(await solicitudPrevia("of-1")).toBe("en_proceso");
  });

  it("si la base falla, no entrega ningún enlace", async () => {
    baseCon({ contract_requests: [consulta({ data: null, error: { message: "caída" } })] });
    expect(await solicitudPrevia("of-1")).toBe("sin_verificar");
  });
});
