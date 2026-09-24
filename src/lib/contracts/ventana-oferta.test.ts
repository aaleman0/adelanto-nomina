import { readFileSync } from "node:fs";
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
 * La ventana la abre la EMPRESA al mandar la oferta y dura un día. Lo que estas
 * pruebas cuidan son las dos maneras de equivocarse: dejar pedir a quien nadie le
 * ofreció nada, y cerrarle el plazo a quien contestó a tiempo.
 *
 * La regla escrita mide desde que el mensaje LLEGÓ al teléfono, pero mientras la
 * ventana y el tope de entrega tardía valgan lo mismo (24 h) el tope manda y el
 * cierre acaba siendo `envío + un día` para todo el mundo. Las pruebas de abajo
 * lo dicen tal cual, en vez de afirmar un anclaje que hoy no cambia nada.
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

  it("unas horas después sigue abierta: el plazo es de un día", () => {
    // El caso que motivó alargar la ventana: ofertas mandadas a las 5 de la
    // tarde. Con dos horas, quien las veía al día siguiente ya no podía pedir.
    expect(evaluarVentana([{ created_at: hace(180), delivered_at: hace(179) }], AHORA).abierta).toBe(true);
    expect(evaluarVentana([{ created_at: hace(18 * 60), delivered_at: hace(18 * 60) }], AHORA).abierta).toBe(true);
  });

  it("pasado el día, cierra", () => {
    expect(evaluarVentana([{ created_at: hace(25 * 60), delivered_at: hace(25 * 60) }], AHORA)).toEqual({
      abierta: false,
      motivo: "fuera_de_plazo",
    });
  });

  it("el teléfono sin señal toda la mañana también cierra a las 24 h del ENVÍO", () => {
    // Mientras ventana y tope valgan lo mismo, el tope manda y el anclaje en la
    // entrega no cambia ningún resultado: la oferta salió hace 9 h, así que
    // cierra dentro de 15, aunque le llegara hace media hora. Si alguien acorta
    // la ventana, esta prueba cambia y el anclaje vuelve a importar.
    expect(evaluarVentana([{ created_at: hace(9 * 60), delivered_at: hace(30) }], AHORA)).toEqual({
      abierta: true,
      cierraEn: AHORA - 9 * 60 * MIN + TOPE_ENTREGA_TARDIA_MS,
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
    ).toEqual({ abierta: true, cierraEn: AHORA - 20 * MIN + TOPE_ENTREGA_TARDIA_MS });
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
    expect(evaluarVentana([{ created_at: hace(30 * 60), delivered_at: dentroDe(10 * 60) }], AHORA)).toEqual({
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

/**
 * La guardia contra volver a atar los dos plazos.
 *
 * `VENTANA_OFERTA_MS` se derivaba de `LINK_TTL_HOURS` "para tener una sola fuente
 * de verdad", y alargar el enlace habría alargado con él el plazo para pedir, que
 * es lo contrario de la regla del cliente. Hoy los dos valen 24 h, así que
 * compararlos ya no prueba nada: lo que se comprueba es que este archivo no
 * dependa del otro. Si alguien vuelve a importar el TTL del enlace aquí, falla.
 *
 * Mira IMPORTS, no menciones: el archivo nombra a `link-ttl.ts` en sus
 * comentarios precisamente para advertir que no hay que atarlos, y esa
 * advertencia no puede ser lo que rompa la prueba.
 */
describe("independencia de los dos plazos", () => {
  it("la ventana no se deriva del enlace de firma", () => {
    // Ruta desde la raíz del proyecto: es el cwd con el que corre vitest, y
    // `import.meta.url` aquí no es una URL de archivo.
    const fuente = readFileSync("src/lib/contracts/ventana-oferta.ts", "utf8");
    expect(fuente).not.toMatch(/\bfrom\s*["'][^"']*link-ttl["']/);
    expect(fuente).not.toMatch(/\brequire\s*\(\s*["'][^"']*link-ttl["']/);
    expect(fuente).not.toMatch(/\bLINK_TTL_(?:HOURS|MS)\b/);
  });

  it("y el enlace de firma tampoco se deriva de la ventana", () => {
    // La guardia va en los dos sentidos: atarlos desde el otro archivo tendría
    // el mismo efecto —no poder mover uno sin mover el otro— y el primer intento
    // de separarlos solo miró este lado.
    const fuente = readFileSync("src/lib/contracts/link-ttl.ts", "utf8");
    expect(fuente).not.toMatch(/\bfrom\s*["'][^"']*ventana-oferta["']/);
    expect(fuente).not.toMatch(/\brequire\s*\(\s*["'][^"']*ventana-oferta["']/);
    expect(fuente).not.toMatch(/\bVENTANA_OFERTA_(?:HORAS|MS)\b/);
  });

  it("y la declara ella misma, en horas legibles", () => {
    expect(VENTANA_OFERTA_MS).toBe(24 * 60 * 60 * 1000);
  });
});

/**
 * (E) El anclaje en `delivered_at` se conserva aunque hoy no cambie ningún
 * resultado —ventana y tope valen lo mismo, así que manda el tope—. Sin inyectar
 * un plazo más corto no habría forma de probarlo y se podría borrar entero con la
 * suite en verde. Estos casos son la ventana de 2 h que hubo hasta el 2026-09-24.
 */
describe("el anclaje en la entrega, con una ventana más corta que el tope", () => {
  const DOS_HORAS = 2 * 60 * 60 * 1000;

  it("el teléfono sin señal toda la mañana cuenta desde que le LLEGÓ", () => {
    expect(evaluarVentana([{ created_at: hace(9 * 60), delivered_at: hace(30) }], AHORA, DOS_HORAS)).toEqual({
      abierta: true,
      cierraEn: AHORA - 30 * MIN + DOS_HORAS,
    });
  });

  it("sin aviso de entrega cuenta desde que salió", () => {
    expect(evaluarVentana([{ created_at: hace(30), delivered_at: null }], AHORA, DOS_HORAS)).toEqual({
      abierta: true,
      cierraEn: AHORA - 30 * MIN + DOS_HORAS,
    });
  });

  it("entregada hace más de dos horas: cerrada", () => {
    expect(evaluarVentana([{ created_at: hace(9 * 60), delivered_at: hace(150) }], AHORA, DOS_HORAS)).toEqual({
      abierta: false,
      motivo: "fuera_de_plazo",
    });
  });

  it("y el tope sigue cortando la entrega que llega días después", () => {
    expect(evaluarVentana([{ created_at: hace(30 * 60), delivered_at: hace(10) }], AHORA, DOS_HORAS)).toEqual({
      abierta: false,
      motivo: "fuera_de_plazo",
    });
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
    // Entregada hace 24 h y 5 min: la ventana cerró hace 5.
    const fila = { created_at: hace(24 * 60 + 5), delivered_at: hace(24 * 60 + 5) };
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
