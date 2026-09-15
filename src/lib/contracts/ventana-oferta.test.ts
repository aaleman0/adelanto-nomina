import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import {
  evaluarVentana,
  pasoAlPedir,
  TOPE_ENTREGA_TARDIA_MS,
  VENTANA_OFERTA_MS,
  ventanaDeLaPersona,
  type EstadoVentana,
} from "./ventana-oferta";

const AHORA = Date.parse("2026-09-07T18:00:00Z");
const MIN = 60_000;
const hace = (minutos: number) => new Date(AHORA - minutos * MIN).toISOString();
const dentroDe = (minutos: number) => new Date(AHORA + minutos * MIN).toISOString();

/**
 * La ventana la abre la EMPRESA al mandar la oferta, y corre desde que el
 * mensaje llega al teléfono. Lo que estas pruebas cuidan son las dos maneras de
 * equivocarse: dejar pedir a quien nadie le ofreció nada, y cerrarle el plazo a
 * quien simplemente no tenía señal.
 */
describe("evaluarVentana", () => {
  it("sin ningún envío de la empresa, no se puede pedir", () => {
    expect(evaluarVentana([], AHORA)).toEqual({ abierta: false, motivo: "sin_envio" });
  });

  it("recién enviada y sin aviso de entrega: cuenta desde que salió", () => {
    expect(evaluarVentana([{ created_at: hace(30), delivered_at: null }], AHORA)).toEqual({
      abierta: true,
      cierraEn: AHORA - 30 * MIN + VENTANA_OFERTA_MS,
    });
  });

  it("entregada al momento hace 3 horas: el plazo ya cerró", () => {
    expect(evaluarVentana([{ created_at: hace(180), delivered_at: hace(179) }], AHORA)).toEqual({
      abierta: false,
      motivo: "fuera_de_plazo",
    });
  });

  it("el teléfono sin señal toda la mañana: las 2 horas cuentan desde que le llegó", () => {
    expect(evaluarVentana([{ created_at: hace(9 * 60), delivered_at: hace(30) }], AHORA)).toEqual({
      abierta: true,
      cierraEn: AHORA - 30 * MIN + VENTANA_OFERTA_MS,
    });
  });

  it("un teléfono que reaparece días después no reabre la oferta", () => {
    expect(evaluarVentana([{ created_at: hace(25 * 60), delivered_at: hace(10) }], AHORA)).toEqual({
      abierta: false,
      motivo: "fuera_de_plazo",
    });
  });

  it("una entrega tardía no se estira más allá de un día desde el envío", () => {
    const salio = AHORA - (23 * 60 + 30) * MIN;
    expect(
      evaluarVentana([{ created_at: new Date(salio).toISOString(), delivered_at: hace(1) }], AHORA),
    ).toEqual({ abierta: true, cierraEn: salio + TOPE_ENTREGA_TARDIA_MS });
  });

  it("si la empresa la reenvía, manda el envío más reciente", () => {
    expect(
      evaluarVentana(
        [
          { created_at: hace(5 * 60), delivered_at: hace(5 * 60) },
          { created_at: hace(20), delivered_at: hace(19) },
        ],
        AHORA,
      ),
    ).toEqual({ abierta: true, cierraEn: AHORA - 19 * MIN + VENTANA_OFERTA_MS });
  });

  it("un desfase de reloj pequeño no le quita el plazo a nadie", () => {
    expect(evaluarVentana([{ created_at: dentroDe(2), delivered_at: null }], AHORA).abierta).toBe(true);
  });

  it("una fecha de envío horas en el futuro es un dato roto y no abre nada", () => {
    expect(evaluarVentana([{ created_at: dentroDe(5 * 60), delivered_at: null }], AHORA)).toEqual({
      abierta: false,
      motivo: "sin_envio",
    });
  });

  it("una entrega fechada en el futuro no deja la ventana abierta para siempre", () => {
    expect(evaluarVentana([{ created_at: hace(3 * 60), delivered_at: dentroDe(10 * 60) }], AHORA)).toEqual({
      abierta: false,
      motivo: "fuera_de_plazo",
    });
  });

  it("fechas ilegibles no abren nada", () => {
    expect(
      evaluarVentana(
        [
          { created_at: "no-es-fecha", delivered_at: null },
          { created_at: null, delivered_at: hace(1) },
        ],
        AHORA,
      ),
    ).toEqual({ abierta: false, motivo: "sin_envio" });
  });
});

describe("pasoAlPedir", () => {
  const abierta: EstadoVentana = { abierta: true, cierraEn: AHORA + MIN };
  const cerrada: EstadoVentana = { abierta: false, motivo: "fuera_de_plazo" };

  it("con la ventana abierta, se pide", () => {
    expect(pasoAlPedir("vigente", abierta)).toBe("pedir");
    expect(pasoAlPedir("solicitada", abierta)).toBe("pedir");
  });

  it("quien ya firmó sigue aunque haya cerrado: solo se le confirma, no se genera nada", () => {
    expect(pasoAlPedir("firmada", cerrada)).toBe("pedir");
  });

  it("quien pidió a tiempo no genera otro contrato fuera de plazo", () => {
    expect(pasoAlPedir("solicitada", cerrada)).toBe("ya_pidio");
  });

  it("con la ventana cerrada, dice por qué", () => {
    expect(pasoAlPedir("vigente", cerrada)).toBe("fuera_de_plazo");
    expect(pasoAlPedir("rechazada", { abierta: false, motivo: "sin_envio" })).toBe("sin_envio");
    expect(pasoAlPedir(undefined, { abierta: false, motivo: "error" })).toBe("error");
  });
});

type Resultado = { data: unknown; error: unknown };

/** Imita el constructor de consultas de Supabase: encadenable, y se resuelve con `await`. */
function consulta(resultado: Resultado) {
  const llamadas: unknown[][] = [];
  const q: Record<string, unknown> = {
    then: (ok: (v: Resultado) => unknown, mal?: (e: unknown) => unknown) =>
      Promise.resolve(resultado).then(ok, mal),
  };
  for (const metodo of ["select", "eq", "in", "not", "order", "limit"]) {
    q[metodo] = (...args: unknown[]) => {
      llamadas.push([metodo, ...args]);
      return q;
    };
  }
  return { q, llamadas };
}

function clienteCon(...consultas: ReturnType<typeof consulta>[]) {
  const tablas: string[] = [];
  let siguiente = 0;
  const cliente = {
    from: vi.fn((tabla: string) => {
      tablas.push(tabla);
      return consultas[siguiente++].q;
    }),
  };
  vi.mocked(getSupabaseAdmin).mockReturnValue(cliente as never);
  return { tablas };
}

beforeEach(() => {
  vi.mocked(getSupabaseAdmin).mockReset();
  vi.mocked(logger.error).mockClear();
});

describe("ventanaDeLaPersona", () => {
  it("solo cuenta el envío de ofertas que Meta aceptó, y solo de esta persona", async () => {
    const envios = consulta({ data: [], error: null });
    const { tablas } = clienteCon(envios);

    await ventanaDeLaPersona("emp-1", AHORA);

    expect(tablas).toEqual(["whatsapp_contract_messages"]);
    expect(envios.llamadas).toContainEqual(["eq", "employee_id", "emp-1"]);
    expect(envios.llamadas).toContainEqual(["eq", "message_type", "bulk_contract_offer"]);
    expect(envios.llamadas).toContainEqual(["not", "wa_message_id", "is", null]);
    expect(envios.llamadas).toContainEqual(["in", "delivery_status", ["sent", "delivered", "read"]]);
  });

  it("el enlace que manda la propia solicitud no abre la ventana", async () => {
    // Si contract_link contara, cada clic en /solicitar se abriría otra
    // ventana y se podría pedir un contrato tras otro fuera de plazo.
    const envios = consulta({ data: [], error: null });
    clienteCon(envios);
    await ventanaDeLaPersona("emp-1", AHORA);
    const filtrosDeTipo = envios.llamadas.filter((llamada) => llamada[1] === "message_type");
    expect(filtrosDeTipo).toEqual([["eq", "message_type", "bulk_contract_offer"]]);
  });

  it("juzga con el momento en que la persona pidió, no con el de procesarlo", async () => {
    // Entregada hace 125 min: la ventana cerró hace 5.
    const fila = { created_at: hace(125), delivered_at: hace(125) };
    clienteCon(consulta({ data: [fila], error: null }), consulta({ data: [fila], error: null }));

    expect((await ventanaDeLaPersona("emp-1", AHORA - 10 * MIN)).abierta).toBe(true);
    expect((await ventanaDeLaPersona("emp-1", AHORA)).abierta).toBe(false);
  });

  it("si la base falla, se cierra: una caída no autoriza contratos", async () => {
    clienteCon(consulta({ data: null, error: { message: "timeout" } }));
    expect(await ventanaDeLaPersona("emp-1", AHORA)).toEqual({ abierta: false, motivo: "error" });
    expect(logger.error).toHaveBeenCalled();
  });

  it("si ni siquiera hay conexión a la base, también se cierra", async () => {
    vi.mocked(getSupabaseAdmin).mockImplementation(() => {
      throw new Error("sin credenciales");
    });
    expect(await ventanaDeLaPersona("emp-1", AHORA)).toEqual({ abierta: false, motivo: "error" });
  });
});
