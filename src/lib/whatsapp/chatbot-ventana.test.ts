import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const { enviar } = vi.hoisted(() => ({ enviar: vi.fn() }));

vi.mock("@/lib/whatsapp/client", () => ({
  getWhatsAppClient: () => ({ sendTextMessage: enviar }),
}));
vi.mock("@/lib/contracts/request-contract", () => ({
  parseRequestContractPayload: (x: unknown) => x,
  requestContractFromWhatsApp: vi.fn(),
}));
vi.mock("@/lib/contracts/ventana-oferta", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/contracts/ventana-oferta")>()),
  ventanaDeLaPersona: vi.fn(),
}));
vi.mock("@/lib/contracts/solicitud-previa", () => ({ solicitudPrevia: vi.fn() }));

import {
  handleInboundMessage,
  CONTRATO_NO_PREPARADO_MESSAGE,
  NO_OFFER_MESSAGE,
  SIN_OFERTA_ABIERTA_MESSAGE,
  VENTANA_CERRADA_MESSAGE,
  type InboundMessage,
  RESPUESTA_DE_OTRA_OFERTA_MESSAGE,
} from "./chatbot";
import { requestContractFromWhatsApp } from "@/lib/contracts/request-contract";
import { ventanaDeLaPersona } from "@/lib/contracts/ventana-oferta";
import { solicitudPrevia } from "@/lib/contracts/solicitud-previa";

type Resultado = { data: unknown; error: unknown };

/** Imita el constructor de consultas de Supabase: encadenable, y se resuelve con `await`. */
function consulta(resultado: Resultado) {
  const q: Record<string, unknown> = {
    then: (ok: (v: Resultado) => unknown, mal?: (e: unknown) => unknown) =>
      Promise.resolve(resultado).then(ok, mal),
    maybeSingle: () => Promise.resolve(resultado),
  };
  for (const metodo of ["select", "eq", "in", "not", "order", "limit", "update"]) {
    q[metodo] = () => q;
  }
  return q;
}

const TELEFONO = "5218713330257";
const EMPLEADO = { id: "emp-1", rfc: "AEEA940214H78", nombre: "Angel Aleman", telefono_normalizado: TELEFONO };
const OFERTA_VIGENTE = { id: "of-1", status: "vigente", is_eligible: true, monto_prestamo_autorizado: 4000 };

function baseCon(colas: Record<string, Resultado[]>) {
  const pendientes = Object.fromEntries(Object.entries(colas).map(([t, rs]) => [t, rs.map(consulta)]));
  vi.mocked(getSupabaseAdmin).mockReturnValue({
    from: (tabla: string) => {
      const siguiente = pendientes[tabla]?.shift();
      if (!siguiente) throw new Error(`consulta inesperada a ${tabla}`);
      return siguiente;
    },
  } as never);
}

const haceMinutos = (m: number) => String(Math.floor((Date.now() - m * 60_000) / 1000));

function boton(texto: string, minutos = 1): InboundMessage {
  return { id: `wamid.${texto}`, from: TELEFONO, timestamp: haceMinutos(minutos), type: "button", button: { text: texto } };
}

/**
 * (H) El corte de antigüedad tiene dos valores y nadie recorría ninguno por
 * `handleInboundMessage`: todas las entradas se construían con un minuto de vida.
 */
describe("antigüedad del mensaje", () => {
  it("un 'Sí' con 7 h de retraso SÍ se atiende: la ventana lo acepta", async () => {
    baseCon({ employees: [{ data: [EMPLEADO], error: null }], advance_offers: [{ data: OFERTA_VIGENTE, error: null }] });
    vi.mocked(ventanaDeLaPersona).mockResolvedValue({ abierta: true, cierraEn: Date.now() + 60_000 });
    vi.mocked(requestContractFromWhatsApp).mockResolvedValue({
      ok: true, status: "contract_ready", link_easylex: "https://easylex.test/firma/tarde",
    } as never);

    const r = await handleInboundMessage(boton("Sí, lo quiero", 7 * 60));

    expect(r.kind).toBe("si");
    expect(requestContractFromWhatsApp).toHaveBeenCalledTimes(1);
  });

  it("un 'Sí' de hace más de un día se descarta: ya no cabe en la ventana", async () => {
    const r = await handleInboundMessage(boton("Sí, lo quiero", 25 * 60));

    expect(r.kind).toBe("demasiado_viejo");
    expect(r.handled).toBe(false);
    expect(requestContractFromWhatsApp).not.toHaveBeenCalled();
    expect(enviar).not.toHaveBeenCalled();
  });

  it("un mensaje que no es respuesta se descarta a la media hora, no al día", async () => {
    const r = await handleInboundMessage({
      id: "wamid.hola", from: TELEFONO, timestamp: haceMinutos(40), type: "text", text: { body: "hola" },
    });

    expect(r.kind).toBe("demasiado_viejo");
    expect(enviar).not.toHaveBeenCalled();
  });

  it("y si sigue reciente, se le contesta la guía", async () => {
    const r = await handleInboundMessage({
      id: "wamid.hola2", from: TELEFONO, timestamp: haceMinutos(10), type: "text", text: { body: "hola" },
    });

    expect(r.kind).toBe("text_fallback");
    expect(enviar).toHaveBeenCalledTimes(1);
  });
});

/**
 * Reimportar el ciclo inserta una oferta nueva con otro monto. Un "Sí" rezagado
 * del ciclo anterior no es consentimiento para la oferta de ahora.
 */
describe("respuesta de un ciclo anterior", () => {
  const OFERTA_NUEVA = { ...OFERTA_VIGENTE, created_at: new Date(Date.now() - 30 * 60_000).toISOString() };

  it("un 'Sí' anterior a la oferta vigente no genera contrato", async () => {
    baseCon({ employees: [{ data: [EMPLEADO], error: null }], advance_offers: [{ data: OFERTA_NUEVA, error: null }] });

    // Lo tocó 3 h antes; la oferta de ahora se creó hace 30 min.
    const r = await handleInboundMessage(boton("Sí, lo quiero", 3 * 60));

    expect(r.kind).toBe("si");
    expect(requestContractFromWhatsApp).not.toHaveBeenCalled();
    expect(ventanaDeLaPersona).not.toHaveBeenCalled();
    expect(enviar).toHaveBeenCalledWith(TELEFONO, RESPUESTA_DE_OTRA_OFERTA_MESSAGE);
  });

  it("un 'No' rezagado tampoco rechaza la oferta nueva", async () => {
    baseCon({ employees: [{ data: [EMPLEADO], error: null }], advance_offers: [{ data: OFERTA_NUEVA, error: null }] });

    const r = await handleInboundMessage(boton("No, gracias", 3 * 60));

    expect(r.kind).toBe("no");
    expect(enviar).toHaveBeenCalledWith(TELEFONO, RESPUESTA_DE_OTRA_OFERTA_MESSAGE);
  });

  it("contestada después de la oferta vigente, sigue su curso normal", async () => {
    baseCon({ employees: [{ data: [EMPLEADO], error: null }], advance_offers: [{ data: OFERTA_NUEVA, error: null }] });
    vi.mocked(ventanaDeLaPersona).mockResolvedValue({ abierta: true, cierraEn: Date.now() + 60_000 });
    vi.mocked(requestContractFromWhatsApp).mockResolvedValue({
      ok: true, status: "contract_ready", link_easylex: "https://easylex.test/firma/ok",
    } as never);

    await handleInboundMessage(boton("Sí, lo quiero", 5));

    expect(requestContractFromWhatsApp).toHaveBeenCalledTimes(1);
  });
});

beforeEach(() => {
  enviar.mockReset();
  vi.mocked(requestContractFromWhatsApp).mockReset();
  vi.mocked(ventanaDeLaPersona).mockReset();
  vi.mocked(solicitudPrevia).mockReset();
});

/**
 * El "Sí" es la única respuesta que genera un contrato legalmente vinculante,
 * y llega desde una superficie sin sesión. Estas pruebas recorren el camino
 * real del chatbot con la ventana simulada: lo que cuidan es que ningún "Sí"
 * llegue al pipeline sin haber pasado por ella.
 */
describe("el Sí pasa por la ventana antes de generar el contrato", () => {
  it("fuera de plazo le dice que cerró y no genera contrato", async () => {
    baseCon({ employees: [{ data: [EMPLEADO], error: null }], advance_offers: [{ data: OFERTA_VIGENTE, error: null }] });
    vi.mocked(ventanaDeLaPersona).mockResolvedValue({ abierta: false, motivo: "fuera_de_plazo" });

    const resultado = await handleInboundMessage(boton("Sí, lo quiero"));

    expect(enviar).toHaveBeenCalledWith(TELEFONO, VENTANA_CERRADA_MESSAGE);
    expect(requestContractFromWhatsApp).not.toHaveBeenCalled();
    expect(resultado).toEqual({ handled: true, kind: "si", employeeId: "emp-1" });
  });

  it("a quien nunca se le envió la oferta no le habla de un plazo vencido", async () => {
    baseCon({ employees: [{ data: [EMPLEADO], error: null }], advance_offers: [{ data: OFERTA_VIGENTE, error: null }] });
    vi.mocked(ventanaDeLaPersona).mockResolvedValue({ abierta: false, motivo: "sin_envio" });

    await handleInboundMessage(boton("Sí, lo quiero"));

    expect(enviar).toHaveBeenCalledWith(TELEFONO, SIN_OFERTA_ABIERTA_MESSAGE);
    expect(requestContractFromWhatsApp).not.toHaveBeenCalled();
  });

  it("un sí escrito pasa por la misma ventana", async () => {
    baseCon({ employees: [{ data: [EMPLEADO], error: null }], advance_offers: [{ data: OFERTA_VIGENTE, error: null }] });
    vi.mocked(ventanaDeLaPersona).mockResolvedValue({ abierta: false, motivo: "fuera_de_plazo" });

    const resultado = await handleInboundMessage({
      id: "wamid.texto",
      from: TELEFONO,
      timestamp: haceMinutos(1),
      type: "text",
      text: { body: "Sí" },
    });

    expect(resultado.kind).toBe("si_texto");
    expect(requestContractFromWhatsApp).not.toHaveBeenCalled();
  });

  it("dentro de la ventana genera el contrato y le manda el enlace", async () => {
    baseCon({ employees: [{ data: [EMPLEADO], error: null }], advance_offers: [{ data: OFERTA_VIGENTE, error: null }] });
    vi.mocked(ventanaDeLaPersona).mockResolvedValue({ abierta: true, cierraEn: Date.now() + 60_000 });
    vi.mocked(requestContractFromWhatsApp).mockResolvedValue({
      ok: true,
      status: "contract_ready",
      link_easylex: "https://easylex.test/firma/abc",
      expires_at_formatted: "7 sep, 2:00 p.m.",
    } as never);

    await handleInboundMessage(boton("Sí, lo quiero"));

    expect(requestContractFromWhatsApp).toHaveBeenCalledTimes(1);
    expect(enviar).toHaveBeenCalledWith(TELEFONO, expect.stringContaining("https://easylex.test/firma/abc"));
  });

  it("mide la ventana con la hora en que la persona contestó, no con la de procesarlo", async () => {
    baseCon({ employees: [{ data: [EMPLEADO], error: null }], advance_offers: [{ data: OFERTA_VIGENTE, error: null }] });
    vi.mocked(ventanaDeLaPersona).mockResolvedValue({ abierta: false, motivo: "fuera_de_plazo" });
    const mensaje = boton("Sí, lo quiero", 20);

    await handleInboundMessage(mensaje);

    expect(ventanaDeLaPersona).toHaveBeenCalledWith("emp-1", Number(mensaje.timestamp) * 1000);
  });

  it("sin oferta vigente no consulta la ventana ni genera nada", async () => {
    baseCon({ employees: [{ data: [EMPLEADO], error: null }], advance_offers: [{ data: null, error: null }] });

    await handleInboundMessage(boton("Sí, lo quiero"));

    expect(enviar).toHaveBeenCalledWith(TELEFONO, NO_OFFER_MESSAGE);
    expect(ventanaDeLaPersona).not.toHaveBeenCalled();
    expect(requestContractFromWhatsApp).not.toHaveBeenCalled();
  });

  it("el No no pasa por la ventana: rechazar fuera de plazo es inofensivo", async () => {
    baseCon({
      employees: [{ data: [EMPLEADO], error: null }],
      advance_offers: [
        { data: OFERTA_VIGENTE, error: null },
        { data: [{ id: "of-1" }], error: null },
      ],
    });

    await handleInboundMessage(boton("No, gracias"));

    expect(ventanaDeLaPersona).not.toHaveBeenCalled();
    expect(enviar).toHaveBeenCalledWith(TELEFONO, expect.stringContaining("Gracias por confirmar"));
  });
});

const OFERTA_SOLICITADA = { ...OFERTA_VIGENTE, status: "solicitada" };

/**
 * Quien ya pidió dentro del plazo no genera otro contrato cuando la ventana
 * cerró, pero recibe lo que de verdad tiene.
 */
describe("quien ya pidió", () => {
  it("con el contrato caído oye la verdad, sin enlace ni contrato nuevo", async () => {
    baseCon({ employees: [{ data: [EMPLEADO], error: null }], advance_offers: [{ data: OFERTA_SOLICITADA, error: null }] });
    vi.mocked(ventanaDeLaPersona).mockResolvedValue({ abierta: false, motivo: "fuera_de_plazo" });
    vi.mocked(solicitudPrevia).mockResolvedValue("fallo");

    await handleInboundMessage(boton("Sí, lo quiero"));

    expect(solicitudPrevia).toHaveBeenCalledWith("of-1");
    expect(enviar).toHaveBeenCalledWith(TELEFONO, CONTRATO_NO_PREPARADO_MESSAGE);
    expect(requestContractFromWhatsApp).not.toHaveBeenCalled();
  });

  it("con un enlace vigente lo recibe: el pipeline lo reusa", async () => {
    baseCon({ employees: [{ data: [EMPLEADO], error: null }], advance_offers: [{ data: OFERTA_SOLICITADA, error: null }] });
    vi.mocked(ventanaDeLaPersona).mockResolvedValue({ abierta: false, motivo: "fuera_de_plazo" });
    vi.mocked(solicitudPrevia).mockResolvedValue("enlace_vigente");
    vi.mocked(requestContractFromWhatsApp).mockResolvedValue({
      ok: true,
      status: "contract_ready",
      link_easylex: "https://easylex.test/firma/regenerado",
      expires_at_formatted: "7 sep, 4:00 p.m.",
      link_reusado: true,
    } as never);

    await handleInboundMessage(boton("Sí, lo quiero"));

    expect(requestContractFromWhatsApp).toHaveBeenCalledTimes(1);
    expect(enviar).toHaveBeenCalledWith(TELEFONO, expect.stringContaining("https://easylex.test/firma/regenerado"));
    // Se le devuelve lo que ya tenía: el mensaje no puede decir que se generó algo.
    expect(enviar).toHaveBeenCalledWith(TELEFONO, expect.not.stringContaining("Generamos"));
  });

  /**
   * El doble toque real: dentro de la ventana, minutos después del primero. Aquí
   * `pasoAlPedir` devuelve "pedir" —la ventana manda sobre el estado de la
   * oferta—, así que no se pasa por la rama de "ya pidió"; el texto tiene que
   * salir del reuso que reporta el pipeline, no de la rama que se tomó.
   */
  it("el doble toque dentro de la ventana tampoco dice que se generó un contrato", async () => {
    baseCon({ employees: [{ data: [EMPLEADO], error: null }], advance_offers: [{ data: OFERTA_SOLICITADA, error: null }] });
    vi.mocked(ventanaDeLaPersona).mockResolvedValue({ abierta: true, cierraEn: Date.now() + 60_000 });
    vi.mocked(requestContractFromWhatsApp).mockResolvedValue({
      ok: true,
      status: "contract_ready",
      link_easylex: "https://easylex.test/firma/abc",
      expires_at_formatted: "8 sep, 9:05 a.m.",
      link_reusado: true,
    } as never);

    await handleInboundMessage(boton("Sí, lo quiero"));

    expect(solicitudPrevia).not.toHaveBeenCalled();
    expect(enviar).toHaveBeenCalledWith(TELEFONO, expect.stringContaining("de nuevo"));
    expect(enviar).toHaveBeenCalledWith(TELEFONO, expect.not.stringContaining("Generamos"));
  });

  it("el primer toque sí anuncia que se generó el contrato", async () => {
    baseCon({ employees: [{ data: [EMPLEADO], error: null }], advance_offers: [{ data: OFERTA_VIGENTE, error: null }] });
    vi.mocked(ventanaDeLaPersona).mockResolvedValue({ abierta: true, cierraEn: Date.now() + 60_000 });
    vi.mocked(requestContractFromWhatsApp).mockResolvedValue({
      ok: true,
      status: "contract_ready",
      link_easylex: "https://easylex.test/firma/nuevo",
      expires_at_formatted: "8 sep, 9:00 a.m.",
      link_reusado: false,
    } as never);

    await handleInboundMessage(boton("Sí, lo quiero"));

    expect(enviar).toHaveBeenCalledWith(TELEFONO, expect.stringContaining("Generamos"));
  });

  it("con la ventana abierta va directo al pipeline, sin revisar su solicitud", async () => {
    baseCon({ employees: [{ data: [EMPLEADO], error: null }], advance_offers: [{ data: OFERTA_SOLICITADA, error: null }] });
    vi.mocked(ventanaDeLaPersona).mockResolvedValue({ abierta: true, cierraEn: Date.now() + 60_000 });
    vi.mocked(requestContractFromWhatsApp).mockResolvedValue({ ok: true, status: "contract_ready", link_easylex: "https://x" } as never);

    await handleInboundMessage(boton("Sí, lo quiero"));

    expect(solicitudPrevia).not.toHaveBeenCalled();
    expect(requestContractFromWhatsApp).toHaveBeenCalledTimes(1);
  });
});
